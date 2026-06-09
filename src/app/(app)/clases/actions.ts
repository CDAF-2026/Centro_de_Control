"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { createClaseSchema } from "@/lib/validations/clase";
import type { AppRole } from "@/lib/database.types";

const WRITE: AppRole[] = ["superadmin", "coord_admin", "coord_deportivo", "recepcion"];

export type ClaseFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

export async function createClaseIndividual(
  _prev: ClaseFormState,
  formData: FormData,
): Promise<ClaseFormState> {
  await requireRole(WRITE);
  const parsed = createClaseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] = i.message;
    return { error: "Revisa los campos.", fieldErrors };
  }
  const d = parsed.data;

  const supabase = await createClient();
  const { data: c, error } = await supabase
    .from("clases")
    .insert({
      tipo: "individual",
      cliente_id: d.clienteId,
      paquete_cliente_id: d.paqueteClienteId ? Number(d.paqueteClienteId) : null,
      profesor_id: d.profesorId || null,
      deporte: d.deporte,
      nivel: d.nivel || null,
      cancha: d.cancha || null,
      fecha: d.fecha,
      hora_inicio: d.horaInicio || null,
      hora_fin: d.horaFin || null,
      precio: d.precio,
      descuento_pct: d.descuento,
      estado: "programada",
    })
    .select("id")
    .single();
  if (error || !c) return { error: error?.message ?? "No se pudo crear la clase." };

  await logAudit({
    action: "clase.create",
    entity: "clases",
    entityId: String(c.id),
    after: { tipo: "individual", fecha: d.fecha },
  });
  revalidatePath("/clases");
  redirect("/clases");
}

// ─────────────────────────────────────────────────────────────
// Asignar una reserva de EasyCancha a un paquete (materializa la clase)
// ─────────────────────────────────────────────────────────────

export type PrepararAsignacion = {
  error?: string;
  clienteId?: number;
  clienteNombre?: string;
  paquetes?: { id: number; label: string }[];
  profesores?: { id: string; nombre: string }[];
};

/** Busca el cliente por correo + sus paquetes activos + la lista de profesores (para el modal). */
export async function prepararAsignacion(email: string): Promise<PrepararAsignacion> {
  await requireRole(WRITE);
  const supabase = await createClient();

  const profs = (await supabase.from("profiles").select("id, nombre").eq("role", "profesor").order("nombre")).data ?? [];
  const profesores = profs.map((p) => ({ id: p.id, nombre: p.nombre ?? "—" }));

  const em = email.trim().toLowerCase();
  if (!em) return { error: "La reserva no tiene correo; no se puede vincular a un cliente.", profesores };

  const { data: cliente } = await supabase
    .from("clientes")
    .select("id, nombres, apellidos")
    .ilike("email", em)
    .limit(1)
    .maybeSingle();
  if (!cliente) {
    return { error: "No hay un cliente con ese correo. Impórtalo/créalo primero (se creará solo al asignar).", profesores };
  }

  const { data: pqs } = await supabase
    .from("paquetes_cliente")
    .select("id, num_clases, clases_consumidas, catalogo_id")
    .eq("cliente_id", cliente.id)
    .eq("estado", "activo");
  const catIds = [...new Set((pqs ?? []).map((p) => p.catalogo_id).filter((x): x is number => x != null))];
  const catName = new Map<number, string>();
  if (catIds.length) {
    const { data } = await supabase.from("paquetes_catalogo").select("id, nombre").in("id", catIds);
    for (const c of data ?? []) catName.set(c.id, c.nombre);
  }
  const paquetes = (pqs ?? [])
    .map((p) => ({ id: p.id, saldo: p.num_clases - p.clases_consumidas, nombre: p.catalogo_id ? catName.get(p.catalogo_id) ?? "Paquete" : "Paquete", num: p.num_clases }))
    .filter((p) => p.saldo > 0)
    .map((p) => ({ id: p.id, label: `${p.nombre} · ${p.saldo}/${p.num} disponibles` }));

  return { clienteId: cliente.id, clienteNombre: `${cliente.nombres} ${cliente.apellidos}`, paquetes, profesores };
}

export async function asignarReservaAPaquete(input: {
  bookingId: string;
  email: string;
  nombres: string;
  apellidos: string;
  telefono: string;
  fecha: string;
  horaInicio: string;
  horaFin: string;
  deporte: "tenis" | "padel" | null;
  cancha: string;
  paqueteClienteId: number;
  profesorId: string;
}): Promise<CierreLikeState> {
  await requireRole(WRITE);
  const supabase = await createClient();

  // Idempotente: una reserva = una clase.
  const { data: existe } = await supabase
    .from("clases")
    .select("id")
    .eq("easycancha_booking_id", input.bookingId)
    .maybeSingle();
  if (existe) return { error: "Esta reserva ya estaba asignada a un paquete." };

  // Cliente por correo (crear si no existe).
  const em = input.email.trim().toLowerCase();
  if (!em) return { error: "La reserva no tiene correo; no se puede vincular a un cliente." };
  let clienteId: number | null = null;
  const { data: c } = await supabase.from("clientes").select("id").ilike("email", em).limit(1).maybeSingle();
  clienteId = c?.id ?? null;
  if (!clienteId) {
    const { data: nc, error } = await supabase
      .from("clientes")
      .insert({ nombres: input.nombres || "(sin nombre)", apellidos: input.apellidos || "", email: em, celular: input.telefono || null, es_menor: false })
      .select("id")
      .single();
    if (error || !nc) return { error: `No se pudo crear el cliente: ${error?.message ?? ""}` };
    clienteId = nc.id;
  }

  // Validar paquete.
  const { data: pq } = await supabase
    .from("paquetes_cliente")
    .select("id, cliente_id, num_clases, clases_consumidas, estado")
    .eq("id", input.paqueteClienteId)
    .maybeSingle();
  if (!pq || pq.cliente_id !== clienteId) return { error: "El paquete no corresponde a este cliente." };
  if (pq.estado !== "activo" || pq.num_clases - pq.clases_consumidas <= 0) return { error: "El paquete no tiene saldo disponible." };

  const { data: clase, error: insErr } = await supabase
    .from("clases")
    .insert({
      tipo: "individual",
      cliente_id: clienteId,
      paquete_cliente_id: input.paqueteClienteId,
      profesor_id: input.profesorId || null,
      deporte: input.deporte,
      cancha: input.cancha || null,
      fecha: input.fecha,
      hora_inicio: input.horaInicio || null,
      hora_fin: input.horaFin || null,
      precio: 0,
      estado: "programada",
      easycancha_booking_id: input.bookingId,
    })
    .select("id")
    .single();
  if (insErr || !clase) return { error: insErr?.message ?? "No se pudo crear la clase." };

  await logAudit({
    action: "clase.asignar_paquete",
    entity: "clases",
    entityId: String(clase.id),
    after: { easycancha_booking_id: input.bookingId, paquete_cliente_id: input.paqueteClienteId },
  });
  revalidatePath("/clases");
  revalidatePath("/cierre");
  return { ok: "Clase asignada al paquete. Ya aparece en clases por cerrar." };
}

type CierreLikeState = { error?: string; ok?: string };
