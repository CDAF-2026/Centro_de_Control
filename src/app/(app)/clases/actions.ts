"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { instanteClase } from "@/lib/fecha";
import { profesoresActivos } from "@/lib/staff";
import { createClaseSchema } from "@/lib/validations/clase";
import type { AppRole } from "@/lib/database.types";

// Derivado de la matriz: el profesor VE el calendario (permiso de lectura) pero
// no puede crear ni materializar clases desde él.
const WRITE: AppRole[] = rolesForModule("clases", "edit");

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
  // Se busca a la PERSONA (miembro); la familia (cliente_id) sale del propio miembro.
  const miembroSel = Number(formData.get("miembroId")) || null;
  let miembroId: number | null = null;
  let clienteId = d.clienteId;
  if (miembroSel) {
    const { data: m } = await supabase.from("cliente_miembros").select("id, cliente_id").eq("id", miembroSel).maybeSingle();
    if (m) { miembroId = m.id; clienteId = m.cliente_id; }
  }
  if (!miembroId && clienteId) {
    const { data: tit } = await supabase.from("cliente_miembros").select("id").eq("cliente_id", clienteId).eq("es_titular", true).maybeSingle();
    miembroId = tit?.id ?? null;
  }

  const { data: c, error } = await supabase
    .from("clases")
    .insert({
      tipo: "individual",
      cliente_id: clienteId,
      miembro_id: miembroId,
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
  sinCorreo: boolean;
  sinCliente: boolean;
  clienteId?: number;
  clienteNombre?: string;
  paquetes: { id: number; label: string }[];
  profesores: { id: string; nombre: string }[];
};

/** Busca el cliente por correo + sus paquetes activos + la lista de profesores (para el modal). */
export async function prepararAsignacion(email: string): Promise<PrepararAsignacion> {
  await requireRole(WRITE);
  const supabase = await createClient();

  const profesores = (await profesoresActivos()).map((p) => ({ id: p.id, nombre: p.nombre ?? "—" }));

  const em = email.trim().toLowerCase();
  if (!em) return { sinCorreo: true, sinCliente: true, paquetes: [], profesores };

  const { data: cliente } = await supabase
    .from("clientes")
    .select("id, nombres, apellidos")
    .ilike("email", em)
    .limit(1)
    .maybeSingle();
  if (!cliente) return { sinCorreo: false, sinCliente: true, paquetes: [], profesores };

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

  return { sinCorreo: false, sinCliente: false, clienteId: cliente.id, clienteNombre: `${cliente.nombres} ${cliente.apellidos}`, paquetes, profesores };
}

export async function materializarReserva(input: {
  modo: "paquete" | "particular";
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
  paqueteClienteId?: number | null;
  precio?: number;
  profesorId: string;
}): Promise<CierreLikeState> {
  await requireRole(WRITE);
  const supabase = await createClient();

  // Idempotente. Se busca "alguna" clase, no exactamente una: un bloqueo de
  // academia puede haberse registrado partido en varias.
  const { data: existe } = await supabase
    .from("clases")
    .select("id")
    .eq("easycancha_booking_id", input.bookingId)
    .limit(1)
    .maybeSingle();
  if (existe) return { error: "Esta reserva ya estaba registrada como clase." };

  // Cliente por correo (crear si no existe). Obligatorio para paquete; opcional para particular.
  const em = input.email.trim().toLowerCase();
  let clienteId: number | null = null;
  if (em) {
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
  }

  let paqueteClienteId: number | null = null;
  let precio = 0;
  if (input.modo === "paquete") {
    if (!clienteId) return { error: "La reserva no tiene correo; no se puede vincular a un paquete." };
    const { data: pq } = await supabase
      .from("paquetes_cliente")
      .select("id, cliente_id, num_clases, clases_consumidas, estado")
      .eq("id", input.paqueteClienteId ?? 0)
      .maybeSingle();
    if (!pq || pq.cliente_id !== clienteId) return { error: "El paquete no corresponde a este cliente." };
    if (pq.estado !== "activo" || pq.num_clases - pq.clases_consumidas <= 0) return { error: "El paquete no tiene saldo disponible." };
    paqueteClienteId = pq.id;
  } else {
    precio = Number.isFinite(input.precio) ? Number(input.precio) : 0;
  }

  const { data: clase, error: insErr } = await supabase
    .from("clases")
    .insert({
      tipo: "individual",
      cliente_id: clienteId,
      paquete_cliente_id: paqueteClienteId,
      profesor_id: input.profesorId || null,
      deporte: input.deporte,
      cancha: input.cancha || null,
      fecha: input.fecha,
      hora_inicio: input.horaInicio || null,
      hora_fin: input.horaFin || null,
      precio,
      estado: "programada",
      easycancha_booking_id: input.bookingId,
    })
    .select("id")
    .single();
  if (insErr || !clase) return { error: insErr?.message ?? "No se pudo crear la clase." };

  await logAudit({
    action: input.modo === "paquete" ? "clase.asignar_paquete" : "clase.particular",
    entity: "clases",
    entityId: String(clase.id),
    after: { easycancha_booking_id: input.bookingId, paquete_cliente_id: paqueteClienteId, modo: input.modo },
  });
  revalidatePath("/clases");
  revalidatePath("/cierre");
  return {
    ok: input.modo === "paquete"
      ? "Clase asignada al paquete. Ya aparece en clases por cerrar."
      : "Clase particular creada. Ya aparece en clases por cerrar.",
  };
}

type CierreLikeState = { error?: string; ok?: string };

/**
 * Corrige el valor cobrado de una clase PARTICULAR (individual sin paquete).
 *
 * Escribe `valor_facturado`, que es un override: el cierre y la liquidación ya leen
 * `valor_facturado ?? precio`, así que no hay que tocarlos. Se conserva `precio` con
 * lo que se tecleó al registrarla, para que quede el rastro de qué se corrigió.
 *
 * Dos guardias, validados AQUÍ y no solo en la pantalla (el guardia de la página no
 * protege la server action):
 *  · Solo particulares: las de paquete derivan su valor del paquete y la academia no
 *    tiene valor por clase; dejar editarlas produciría cifras que nadie sabría explicar.
 *  · Pasadas 24 h del inicio de la clase, solo el SA. Se usa el MISMO plazo y el mismo
 *    helper que el techo de `/cierre` a propósito: así el equipo tiene una sola regla que
 *    recordar ("24 h desde que empezó") en vez de dos parecidas. Medido en agosto-2026,
 *    una clase particular se registra y se cierra en segundos, así que atar el permiso al
 *    estado `programada` habría dejado a recepción sin ventana real para corregir.
 */
export async function editarValorClase(_prev: CierreLikeState, formData: FormData): Promise<CierreLikeState> {
  const profile = await requireRole(WRITE);
  const claseId = Number(formData.get("claseId"));
  const crudo = String(formData.get("valor") ?? "").replace(/[^\d]/g, "");
  if (!claseId) return { error: "Clase inválida." };
  if (!crudo) return { error: "Escribe el valor cobrado." };
  const valor = Number(crudo);
  if (!Number.isFinite(valor) || valor < 0) return { error: "El valor debe ser un número positivo." };
  if (valor > 100_000_000) return { error: "Ese valor es demasiado alto; revísalo." };

  const supabase = await createClient();
  const { data: clase } = await supabase
    .from("clases")
    .select("id, tipo, estado, fecha, hora_inicio, paquete_cliente_id, precio, valor_facturado")
    .eq("id", claseId)
    .maybeSingle();
  if (!clase) return { error: "No se encontró la clase." };
  if (clase.tipo !== "individual" || clase.paquete_cliente_id) {
    return { error: "Solo se puede corregir el valor de una clase particular." };
  }
  const venció = Date.now() > instanteClase(clase.fecha, clase.hora_inicio, "23:59:00") + 24 * 3600 * 1000;
  if (venció && profile.role !== "superadmin") {
    return { error: "Pasaron más de 24 h desde la clase y su valor ya cuenta para la liquidación. Pídele el ajuste al superadministrador." };
  }

  const { error } = await supabase.from("clases").update({ valor_facturado: valor }).eq("id", claseId);
  if (error) return { error: error.message };

  await logAudit({
    action: "clase.editar_valor",
    entity: "clases",
    entityId: String(claseId),
    before: { valor_facturado: clase.valor_facturado, precio: clase.precio },
    after: { valor_facturado: valor, estado: clase.estado },
  });
  revalidatePath("/clases");
  revalidatePath("/cierre");
  revalidatePath("/liquidacion");
  return { ok: "Valor actualizado." };
}

// ─────────────────────────────────────────────────────────────
// Registrar un bloqueo de academia de EasyCancha como clase(s)
// ─────────────────────────────────────────────────────────────

export type AcademiaOpcion = {
  id: number;
  nombre: string;
  deporte: string | null;
  dias: number[];
  horaInicio: string | null;
  horaFin: string | null;
  cancha: string | null;
  profesorId: string | null;
};

export type PrepararAcademia = {
  academias: AcademiaOpcion[];
  profesores: { id: string; nombre: string }[];
};

/** Academias activas + profesores, para el modo "Academia" del modal. */
export async function prepararAcademia(): Promise<PrepararAcademia> {
  await requireRole(WRITE);
  const supabase = await createClient();

  const profesores = (await profesoresActivos()).map((p) => ({ id: p.id, nombre: p.nombre ?? "—" }));
  const { data } = await supabase
    .from("academias")
    .select("id, nombre, deporte, dias_semana, hora_inicio, hora_fin, cancha, profesor_id")
    .eq("activa", true)
    .order("nombre");

  const academias = (data ?? []).map((a) => ({
    id: a.id,
    nombre: a.nombre,
    deporte: a.deporte,
    dias: a.dias_semana ?? [],
    horaInicio: a.hora_inicio?.slice(0, 5) ?? null,
    horaFin: a.hora_fin?.slice(0, 5) ?? null,
    cancha: a.cancha,
    profesorId: a.profesor_id,
  }));
  return { academias, profesores };
}

/**
 * Registra un bloqueo de academia como una o varias clases.
 *
 * Un bloque de EasyCancha puede durar horas y contener academias DISTINTAS
 * seguidas (miércoles 08:00–12:00 en Cancha 4 = Bola Naranja 08:00 + Bola
 * Amarilla 11:00), por eso entra una lista de {academia, hora} ya armada en el
 * modal y aquí solo se valida y se inserta.
 *
 * Sin cliente: el bloque es del club, no de una persona; el cobro de academia
 * sale de la asistencia. `profesorId` vacío = cada clase con el profesor de su
 * propia academia.
 */
export async function materializarAcademia(input: {
  bookingId: string;
  fecha: string;
  deporte: "tenis" | "padel" | null;
  cancha: string;
  profesorId: string;
  clases: { academiaId: number; inicio: string; fin: string }[];
}): Promise<CierreLikeState> {
  await requireRole(WRITE);
  const supabase = await createClient();

  if (!input.clases.length) return { error: "Escoge al menos una clase que registrar." };

  const { data: existe } = await supabase
    .from("clases")
    .select("id")
    .eq("easycancha_booking_id", input.bookingId)
    .limit(1)
    .maybeSingle();
  if (existe) return { error: "Este bloqueo ya estaba registrado como clase." };

  const ids = [...new Set(input.clases.map((c) => c.academiaId))];
  const { data: acas } = await supabase
    .from("academias")
    .select("id, nombre, nivel, profesor_id")
    .in("id", ids);
  const porId = new Map((acas ?? []).map((a) => [a.id, a]));
  if (ids.some((id) => !porId.has(id))) return { error: "Alguna academia ya no existe." };

  const filas = input.clases.map((c) => {
    const a = porId.get(c.academiaId)!;
    return {
      tipo: "academia" as const,
      academia_id: a.id,
      profesor_id: input.profesorId || a.profesor_id || null,
      deporte: input.deporte,
      nivel: a.nivel,
      cancha: input.cancha || null,
      fecha: input.fecha,
      hora_inicio: c.inicio || null,
      hora_fin: c.fin || null, // un bloqueo sin hora de fin entra como clase suelta
      precio: 0,
      estado: "programada" as const,
      easycancha_booking_id: input.bookingId,
    };
  });

  const { error } = await supabase.from("clases").insert(filas);
  if (error) return { error: error.message };

  await logAudit({
    action: "clase.academia",
    entity: "clases",
    entityId: input.bookingId,
    after: { easycancha_booking_id: input.bookingId, clases: filas.length, academias: ids },
  });
  revalidatePath("/clases");
  revalidatePath("/cierre");

  const nombres = [...new Set(ids.map((id) => porId.get(id)!.nombre))];
  return {
    ok: filas.length === 1
      ? `Clase de ${nombres[0]} registrada. Ya aparece en clases por cerrar.`
      : `${filas.length} clases registradas (${nombres.join(", ")}). Ya aparecen en clases por cerrar.`,
  };
}
