"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import type { AppRole, Deporte } from "@/lib/database.types";

// Derivado de la matriz: desde jul-2026 los torneos los lleva el coordinador
// DEPORTIVO, no el administrativo. Escrito a mano se habría quedado al revés.
const ADMIN: AppRole[] = rolesForModule("eventos", "edit");
const TIPOS = ["torneo", "clinica", "masterclass", "otro"];
/** Un archivo "use server" solo puede exportar funciones async: esta lista queda interna. */
const CATEGORIAS_GASTO = [
  "refrigerios",
  "premios",
  "logistica",
  "publicidad",
  "arbitraje",
  "staff_externo",
  "otro",
] as const;

export type EventoState = { error?: string; ok?: string };

/**
 * Un evento cerrado tiene su utilidad CONGELADA y ya publicada en el dashboard. Si se
 * pudiera seguir editando, la cifra del snapshot dejaría de corresponder con el detalle.
 * Para corregir hay que reabrirlo (queda en audit_log).
 */
async function evitarSiCerrado(
  supabase: Awaited<ReturnType<typeof createClient>>,
  eventoId: number,
): Promise<string | null> {
  const { data } = await supabase.from("eventos").select("cerrado_el").eq("id", eventoId).single();
  return data?.cerrado_el ? "El evento está cerrado. Reábrelo para poder editarlo." : null;
}

export async function crearEvento(_prev: EventoState, formData: FormData): Promise<EventoState> {
  await requireRole(ADMIN);
  const nombre = String(formData.get("nombre") || "").trim();
  const tipoRaw = String(formData.get("tipo") || "otro");
  const tipo = TIPOS.includes(tipoRaw) ? tipoRaw : "otro";
  const deporteRaw = String(formData.get("deporte") || "");
  const deporte = deporteRaw === "tenis" || deporteRaw === "padel" ? (deporteRaw as Deporte) : null;
  const servicioId = Number(formData.get("servicio_id")) || null;
  const fechaInicio = String(formData.get("fecha_inicio") || "");
  const fechaFin = String(formData.get("fecha_fin") || "") || null;
  const horaInicio = String(formData.get("hora_inicio") || "") || null;
  const lugar = String(formData.get("lugar") || "").trim() || null;
  const cupo = Number(formData.get("cupo")) || null;
  const precio = Number(formData.get("precio_inscripcion") || 0);
  const notas = String(formData.get("notas") || "").trim() || null;
  if (!nombre) return { error: "El nombre es obligatorio." };
  if (!fechaInicio) return { error: "La fecha de inicio es obligatoria." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("eventos")
    .insert({
      nombre,
      tipo,
      deporte,
      servicio_id: servicioId,
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
      hora_inicio: horaInicio,
      lugar,
      cupo,
      precio_inscripcion: precio,
      notas,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  await logAudit({ action: "evento.crear", entity: "eventos", entityId: String(data.id), after: { nombre } });

  // Profesores responsables asignados desde la creación (opcional, repetible).
  const profIds = formData.getAll("prof_id").map(String);
  const profPagos = formData.getAll("prof_pago").map((v) => Number(v) || 0);
  const vistos = new Set<string>();
  const filasProf = profIds
    .map((pid, i) => ({ evento_id: data.id, profesor_id: pid, pago: profPagos[i] ?? 0 }))
    .filter((f) => f.profesor_id && !vistos.has(f.profesor_id) && vistos.add(f.profesor_id));
  if (filasProf.length) await supabase.from("evento_profesores").insert(filasProf);

  redirect(`/eventos/${data.id}`);
}

export async function inscribirParticipante(_prev: EventoState, formData: FormData): Promise<EventoState> {
  await requireRole(ADMIN);
  const eventoId = Number(formData.get("evento_id"));
  const clienteId = Number(formData.get("clienteId")) || null;
  const nombreExterno = String(formData.get("nombre_externo") || "").trim() || null;
  const telefonoExterno = String(formData.get("telefono_externo") || "").trim() || null;
  const monto = Number(formData.get("monto") || 0);
  // El pago se marca A MANO. Antes bastaba con teclear el monto para que la ficha lo
  // diera por pagado, y son dos cosas distintas: el monto es lo que DEBE por inscribirse,
  // no lo que ya entregó.
  const pagado = formData.get("pagado") === "on";
  if (!eventoId) return { error: "Evento inválido." };
  if (!clienteId && !nombreExterno) return { error: "Indica un cliente o un nombre externo." };

  const supabase = await createClient();
  const cerrado = await evitarSiCerrado(supabase, eventoId);
  if (cerrado) return { error: cerrado };
  // El ingreso del evento NO se crea aquí: viene de las facturas de Siigo y se ata al
  // evento en la conciliación. Aquí solo se registra el participante (monto referencial).
  const { error } = await supabase.from("evento_participantes").insert({
    evento_id: eventoId,
    cliente_id: clienteId,
    nombre_externo: nombreExterno,
    telefono_externo: telefonoExterno,
    monto,
    estado: pagado ? "pagado" : "inscrito",
  });
  if (error) return { error: error.message };
  await logAudit({ action: "evento.inscribir", entity: "evento_participantes", entityId: String(eventoId), after: { clienteId, nombreExterno, monto, pagado } });
  revalidatePath(`/eventos/${eventoId}`);
  return { ok: "Participante inscrito." };
}

export async function quitarParticipante(_prev: EventoState, formData: FormData): Promise<EventoState> {
  await requireRole(ADMIN);
  const id = Number(formData.get("id"));
  const eventoId = Number(formData.get("evento_id"));
  if (!id) return { error: "Inválido." };
  const supabase = await createClient();
  await supabase.from("evento_participantes").delete().eq("id", id);
  await logAudit({ action: "evento.quitar_participante", entity: "evento_participantes", entityId: String(id) });
  revalidatePath(`/eventos/${eventoId}`);
  return { ok: "Participante eliminado." };
}

/**
 * Marca o desmarca el pago de un participante. Existe porque la inscripción ya NO da el
 * pago por hecho: sin esto, quien se inscribe sin pagar se quedaría en pendiente para
 * siempre y la lista no serviría para cobrar.
 *
 * OJO: esto es control interno del torneo (quién ya entregó la plata), NO es el ingreso
 * del evento — ese sigue saliendo de las facturas de Siigo atadas más arriba.
 */
export async function cambiarPagoParticipante(_prev: EventoState, formData: FormData): Promise<EventoState> {
  await requireRole(ADMIN);
  const id = Number(formData.get("id"));
  const eventoId = Number(formData.get("evento_id"));
  if (!id || !eventoId) return { error: "Inválido." };

  const supabase = await createClient();
  const cerrado = await evitarSiCerrado(supabase, eventoId);
  if (cerrado) return { error: cerrado };

  const { data: actual } = await supabase
    .from("evento_participantes")
    .select("estado")
    .eq("id", id)
    .single();
  if (!actual) return { error: "El participante no existe." };
  // Un participante cancelado no cambia de pago desde aquí: primero hay que reinscribirlo.
  if (actual.estado === "cancelado") return { error: "Ese participante está cancelado." };

  const nuevo = actual.estado === "pagado" ? "inscrito" : "pagado";
  const { error } = await supabase.from("evento_participantes").update({ estado: nuevo }).eq("id", id);
  if (error) return { error: error.message };

  await logAudit({
    action: "evento.pago_participante",
    entity: "evento_participantes",
    entityId: String(id),
    before: { estado: actual.estado },
    after: { estado: nuevo },
  });
  revalidatePath(`/eventos/${eventoId}`);
  return { ok: nuevo === "pagado" ? "Marcado como pagado." : "Marcado como pendiente." };
}

export async function agregarProfesor(_prev: EventoState, formData: FormData): Promise<EventoState> {
  await requireRole(ADMIN);
  const eventoId = Number(formData.get("evento_id"));
  const profesorId = String(formData.get("profesor_id") || "");
  const rol = String(formData.get("rol") || "").trim() || null;
  const pago = Number(formData.get("pago") || 0);
  if (!eventoId) return { error: "Evento inválido." };
  if (!profesorId) return { error: "Selecciona un profesor." };
  const supabase = await createClient();
  const cerrado = await evitarSiCerrado(supabase, eventoId);
  if (cerrado) return { error: cerrado };
  const { error } = await supabase
    .from("evento_profesores")
    .insert({ evento_id: eventoId, profesor_id: profesorId, rol, pago });
  if (error) return { error: error.message };
  await logAudit({ action: "evento.agregar_profesor", entity: "evento_profesores", entityId: String(eventoId), after: { profesorId, pago } });
  revalidatePath(`/eventos/${eventoId}`);
  revalidatePath("/liquidacion");
  return { ok: "Profesor agregado." };
}

export async function quitarProfesor(_prev: EventoState, formData: FormData): Promise<EventoState> {
  await requireRole(ADMIN);
  const id = Number(formData.get("id"));
  const eventoId = Number(formData.get("evento_id"));
  if (!id) return { error: "Inválido." };
  const supabase = await createClient();
  const cerrado = await evitarSiCerrado(supabase, eventoId);
  if (cerrado) return { error: cerrado };
  await supabase.from("evento_profesores").delete().eq("id", id);
  await logAudit({ action: "evento.quitar_profesor", entity: "evento_profesores", entityId: String(id) });
  revalidatePath(`/eventos/${eventoId}`);
  revalidatePath("/liquidacion");
  return { ok: "Profesor eliminado." };
}

// ─────────────────────────────── Gastos del evento ───────────────────────────────

/**
 * Registra un gasto del evento (refrigerios, premios, logística…), con soporte opcional.
 * OJO: el pago a los profesores NO se registra aquí — el P&G ya lo toma de
 * `evento_profesores.pago`, así que meterlo también como gasto lo contaría doble.
 */
export async function registrarGasto(_prev: EventoState, formData: FormData): Promise<EventoState> {
  await requireRole(ADMIN);
  const eventoId = Number(formData.get("evento_id"));
  const concepto = String(formData.get("concepto") || "").trim();
  const categoriaRaw = String(formData.get("categoria") || "otro");
  const categoria = (CATEGORIAS_GASTO as readonly string[]).includes(categoriaRaw) ? categoriaRaw : "otro";
  const monto = Number(formData.get("monto") || 0);
  const proveedor = String(formData.get("proveedor") || "").trim() || null;
  const fecha = String(formData.get("fecha") || "") || undefined;
  const notas = String(formData.get("notas") || "").trim() || null;
  if (!eventoId) return { error: "Evento inválido." };
  if (!concepto) return { error: "Escribe el concepto del gasto." };
  // Se permite CERO a propósito: un patrocinador que pone los premios no le cuesta nada
  // al club, pero el club quiere dejarlo visible en el detalle del torneo. La base ya lo
  // aceptaba (`check (monto >= 0)`); el que lo impedía era este validador.
  if (!Number.isFinite(monto) || monto < 0) return { error: "El monto no puede ser negativo." };

  const supabase = await createClient();
  const cerrado = await evitarSiCerrado(supabase, eventoId);
  if (cerrado) return { error: cerrado };

  // Soporte opcional (factura del proveedor, foto del recibo) al bucket privado.
  let soportePath: string | null = null;
  const archivo = formData.get("soporte");
  if (archivo instanceof File && archivo.size > 0) {
    if (archivo.size > 10 * 1024 * 1024) return { error: "El soporte supera 10 MB." };
    const path = `${eventoId}/${Date.now()}-${archivo.name}`;
    const { error: upErr } = await supabase.storage.from("evento-docs").upload(path, archivo);
    if (upErr) return { error: upErr.message };
    soportePath = path;
  }

  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from("evento_gastos").insert({
    evento_id: eventoId,
    concepto,
    categoria,
    monto,
    proveedor,
    fecha,
    soporte_path: soportePath,
    registrado_por: user?.id ?? null,
    notas,
  });
  if (error) {
    if (soportePath) await supabase.storage.from("evento-docs").remove([soportePath]);
    return { error: error.message };
  }

  await logAudit({ action: "evento.gasto.registrar", entity: "evento_gastos", entityId: String(eventoId), after: { concepto, categoria, monto } });
  revalidatePath(`/eventos/${eventoId}`);
  revalidatePath("/eventos");
  return { ok: "Gasto registrado." };
}

export async function quitarGasto(_prev: EventoState, formData: FormData): Promise<EventoState> {
  await requireRole(ADMIN);
  const id = Number(formData.get("id"));
  const eventoId = Number(formData.get("evento_id"));
  if (!id) return { error: "Inválido." };
  const supabase = await createClient();
  const cerrado = await evitarSiCerrado(supabase, eventoId);
  if (cerrado) return { error: cerrado };

  const { data: gasto } = await supabase.from("evento_gastos").select("soporte_path").eq("id", id).single();
  if (gasto?.soporte_path) await supabase.storage.from("evento-docs").remove([gasto.soporte_path]);
  const { error } = await supabase.from("evento_gastos").delete().eq("id", id);
  if (error) return { error: error.message };

  await logAudit({ action: "evento.gasto.quitar", entity: "evento_gastos", entityId: String(id) });
  revalidatePath(`/eventos/${eventoId}`);
  revalidatePath("/eventos");
  return { ok: "Gasto eliminado." };
}

// ──────────────────────── Facturas del evento (sus ingresos) ────────────────────────

/**
 * Ata facturas de Siigo al evento: es lo que hace que su plata cuente como ingreso del
 * P&G y salga del bruto del dashboard.
 *
 * OJO — atar NO es conciliar. `estado_conciliacion` y `cliente_id` se dejan intactos:
 * una factura de mostrador sigue siendo anónima, solo queda dicho de qué torneo es.
 * Son dos preguntas distintas y por eso este botón vive en la ficha del evento y no en
 * la cola de /pagos, donde las `auto` y las `mostrador` nunca aparecen (ver 0050).
 */
export async function atarFacturas(_prev: EventoState, formData: FormData): Promise<EventoState> {
  await requireRole(ADMIN);
  const eventoId = Number(formData.get("evento_id"));
  const ids = formData.getAll("factura_id").map(Number).filter((n) => Number.isFinite(n) && n > 0);
  if (!eventoId) return { error: "Evento inválido." };
  if (!ids.length) return { error: "Marca al menos una factura." };

  const supabase = await createClient();
  const cerrado = await evitarSiCerrado(supabase, eventoId);
  if (cerrado) return { error: cerrado };

  // Va por RPC y no por update directo: quien gestiona eventos no tiene escritura sobre
  // `siigo_facturas` (es la tabla del dinero) y una política de UPDATE no se puede limitar
  // a la columna `evento_id`. La función es el permiso estrecho — y adentro solo ata las
  // que están libres, así que si otro evento ya se llevó una, no se la quita.
  const { data: atadas, error } = await supabase.rpc("evento_atar_facturas", {
    p_evento: eventoId,
    p_facturas: ids,
  });
  if (error) return { error: error.message };

  const n = Number(atadas ?? 0);
  await logAudit({
    action: "evento.atar_facturas",
    entity: "eventos",
    entityId: String(eventoId),
    after: { pedidas: ids.length, atadas: n },
  });
  revalidatePath(`/eventos/${eventoId}`);
  revalidatePath("/eventos");
  revalidatePath("/pagos");
  if (n < ids.length) return { ok: `${n} de ${ids.length} atadas; el resto ya estaba en otro evento.` };
  return { ok: n === 1 ? "Factura atada al evento." : `${n} facturas atadas al evento.` };
}

/** Suelta una factura del evento: su plata vuelve a contar como facturación normal. */
export async function soltarFactura(_prev: EventoState, formData: FormData): Promise<EventoState> {
  await requireRole(ADMIN);
  const id = Number(formData.get("id"));
  const eventoId = Number(formData.get("evento_id"));
  if (!id || !eventoId) return { error: "Inválido." };

  const supabase = await createClient();
  const cerrado = await evitarSiCerrado(supabase, eventoId);
  if (cerrado) return { error: cerrado };

  // Mismo motivo que atarFacturas: el permiso estrecho vive en la función, no en la tabla.
  const { error } = await supabase.rpc("evento_soltar_factura", { p_factura: id });
  if (error) return { error: error.message };

  await logAudit({ action: "evento.soltar_factura", entity: "siigo_facturas", entityId: String(id) });
  revalidatePath(`/eventos/${eventoId}`);
  revalidatePath("/eventos");
  revalidatePath("/pagos");
  return { ok: "Factura desatada del evento." };
}

// ──────────────────────────── Cierre financiero del evento ────────────────────────────

/**
 * Cierra el evento: CONGELA su P&G en el snapshot (`cierre_*`) y a partir de ahí el evento
 * aporta al dashboard su UTILIDAD (no su facturación bruta), imputada al mes del evento.
 *
 * Se congela en vez de recalcular en vivo porque si no, una factura que llegue tarde o un
 * gasto corregido moverían un mes ya publicado.
 */
export async function cerrarEvento(_prev: EventoState, formData: FormData): Promise<EventoState> {
  await requireRole(ADMIN);
  const eventoId = Number(formData.get("evento_id"));
  if (!eventoId) return { error: "Evento inválido." };

  const supabase = await createClient();
  const { data: evento } = await supabase.from("eventos").select("estado, cerrado_el").eq("id", eventoId).single();
  if (!evento) return { error: "El evento no existe." };
  if (evento.cerrado_el) return { error: "El evento ya está cerrado." };
  if (evento.estado === "cancelado") return { error: "Un evento cancelado no se cierra: no aporta al dashboard." };

  const { data: pyg, error: pygErr } = await supabase.rpc("eventos_pyg", { p_evento: eventoId });
  if (pygErr) return { error: pygErr.message };
  const r = pyg?.[0];
  if (!r) return { error: "No se pudo calcular el P&G del evento." };

  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("eventos")
    .update({
      cerrado_el: new Date().toISOString(),
      cerrado_por: user?.id ?? null,
      cierre_ingreso: Number(r.ingreso_facturado),
      cierre_costo: Number(r.costo_total),
      cierre_utilidad: Number(r.utilidad),
      estado: "finalizado",
    })
    .eq("id", eventoId);
  if (error) return { error: error.message };

  await logAudit({
    action: "evento.cerrar",
    entity: "eventos",
    entityId: String(eventoId),
    after: { ingreso: Number(r.ingreso_facturado), costo: Number(r.costo_total), utilidad: Number(r.utilidad) },
  });
  revalidatePath(`/eventos/${eventoId}`);
  revalidatePath("/eventos");
  revalidatePath("/dashboard");
  return { ok: "Evento cerrado. Su utilidad ya entra al dashboard." };
}

/** Reabre un evento cerrado (solo superadmin): borra el snapshot y lo saca del dashboard. */
export async function reabrirEvento(_prev: EventoState, formData: FormData): Promise<EventoState> {
  await requireRole(["superadmin"]);
  const eventoId = Number(formData.get("evento_id"));
  if (!eventoId) return { error: "Evento inválido." };

  const supabase = await createClient();
  const { data: antes } = await supabase
    .from("eventos")
    .select("cierre_ingreso, cierre_costo, cierre_utilidad")
    .eq("id", eventoId)
    .single();

  const { error } = await supabase
    .from("eventos")
    .update({ cerrado_el: null, cerrado_por: null, cierre_ingreso: null, cierre_costo: null, cierre_utilidad: null })
    .eq("id", eventoId);
  if (error) return { error: error.message };

  await logAudit({ action: "evento.reabrir", entity: "eventos", entityId: String(eventoId), before: antes ?? undefined });
  revalidatePath(`/eventos/${eventoId}`);
  revalidatePath("/eventos");
  revalidatePath("/dashboard");
  return { ok: "Evento reabierto. Ya no aporta al dashboard hasta que lo cierres de nuevo." };
}
