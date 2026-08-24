"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { createClienteSchema, esMenorDeEdad } from "@/lib/validations/cliente";
import { getBookings, type EcBooking } from "@/lib/easycancha/client";
import { sendEmail } from "@/lib/email/resend";
import { paqueteAsignadoEmail } from "@/lib/email/paquete-asignado";
import type { AppRole, Deporte, TipoDocumento, Rh, FacturaTipo } from "@/lib/database.types";
import { clausulasBusqueda } from "./buscar";

// Derivado de la matriz en vez de escrito a mano: cuando cambian los permisos
// de un rol, estos guardias tienen que moverse con ellos. Si no, el módulo le
// aparece en el menú y las acciones se lo rechazan (o al revés, que es peor).
const WRITE_ROLES: AppRole[] = rolesForModule("clientes", "edit");

/** Resuelve el miembro a usar: el indicado (si pertenece a la ficha) o el titular. */
async function resolverMiembro(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clienteId: number,
  miembroId: number | null,
): Promise<number | null> {
  if (miembroId) {
    const { data } = await supabase.from("cliente_miembros").select("id").eq("id", miembroId).eq("cliente_id", clienteId).maybeSingle();
    if (data) return data.id;
  }
  const { data: tit } = await supabase.from("cliente_miembros").select("id").eq("cliente_id", clienteId).eq("es_titular", true).maybeSingle();
  return tit?.id ?? null;
}

/**
 * El titular vive dos veces: en `clientes` y en su fila espejo de
 * `cliente_miembros`. Al editar la ficha hay que mover las dos, o la tarjeta
 * de Hermanos y los selectores de miembro se quedan con el dato viejo.
 */
async function sincronizarTitular(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clienteId: number,
  datos: {
    nombres: string;
    apellidos: string;
    fecha_nacimiento: string | null;
    documento: string | null;
    tipo_documento: TipoDocumento | null;
    eps: string | null;
    rh: Rh | null;
    deportes: Deporte[];
  },
): Promise<void> {
  const { data: titular } = await supabase
    .from("cliente_miembros")
    .select("id")
    .eq("cliente_id", clienteId)
    .eq("es_titular", true)
    .maybeSingle();

  if (titular) {
    await supabase.from("cliente_miembros").update(datos).eq("id", titular.id);
  } else {
    // Ficha que se quedó sin fila de titular (alta a medias): se crea al vuelo.
    await supabase.from("cliente_miembros").insert({ ...datos, cliente_id: clienteId, es_titular: true });
  }
}

/** Lee los checkboxes de deportes del formulario (tenis/padel). */
function leerDeportes(formData: FormData): Deporte[] {
  const vals = formData.getAll("deportes");
  return (["tenis", "padel"] as const).filter((dep) => vals.includes(dep));
}

/** Tipo de documento del formulario. Sin número no hay tipo que guardar, y un
 *  valor fuera de la lista lo rechazaría el CHECK de la base. */
function leerTipoDocumento(formData: FormData, documento?: string | null): TipoDocumento | null {
  if (!documento) return null;
  const v = String(formData.get("tipoDocumento") ?? "").trim().toUpperCase();
  return (["CC", "TI", "CE", "PP", "NIT", "PPT", "RC"] as const).find((t) => t === v) ?? null;
}

/** RH del formulario, validado contra la lista cerrada (el CHECK lo rechazaría igual). */
function leerRh(formData: FormData): Rh | null {
  const v = String(formData.get("rh") ?? "").trim().toUpperCase();
  return (["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"] as const).find((x) => x === v) ?? null;
}

/** Tipo de facturación (natural|juridica) del formulario. */
function leerFacturaTipo(formData: FormData): FacturaTipo | null {
  const v = String(formData.get("facturaTipo") ?? "").trim().toLowerCase();
  return v === "natural" || v === "juridica" ? v : null;
}

/** Campo de texto opcional: vacío → null. */
function texto(formData: FormData, name: string): string | null {
  return String(formData.get(name) ?? "").trim() || null;
}

export type ClienteFormState = {
  error?: string;
  ok?: string;
  fieldErrors?: Record<string, string>;
};

export async function createCliente(
  _prev: ClienteFormState,
  formData: FormData,
): Promise<ClienteFormState> {
  await requireRole(WRITE_ROLES);

  const parsed = createClienteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] = issue.message;
    return { error: "Revisa los campos.", fieldErrors };
  }
  const d = parsed.data;
  const menor = esMenorDeEdad(d.fechaNacimiento);
  const tipoDocumento = leerTipoDocumento(formData, d.documento);
  const eps = texto(formData, "eps");
  const rh = leerRh(formData);

  // Regla dura: un menor exige acudiente.
  if (menor && !d.acudienteNombre) {
    return {
      error: "Los menores de edad requieren acudiente.",
      fieldErrors: { acudienteNombre: "Nombre del acudiente obligatorio para menores" },
    };
  }

  const supabase = await createClient();

  let acudienteId: number | null = null;
  if (menor) {
    const { data: ac, error: acErr } = await supabase
      .from("acudientes")
      .insert({
        nombre: d.acudienteNombre!,
        documento: d.acudienteDocumento || null,
        telefono: d.acudienteTelefono || null,
        parentesco: d.acudienteParentesco || null,
      })
      .select("id")
      .single();
    if (acErr || !ac) return { error: acErr?.message ?? "No se pudo guardar el acudiente." };
    acudienteId = ac.id;
  }

  const { data: cli, error } = await supabase
    .from("clientes")
    .insert({
      nombres: d.nombres,
      apellidos: d.apellidos,
      documento: d.documento || null,
      tipo_documento: tipoDocumento,
      eps,
      rh,
      fecha_nacimiento: d.fechaNacimiento || null,
      es_menor: menor,
      celular: d.celular || null,
      email: d.email || null,
      emergencia_nombre: d.emergenciaNombre || null,
      emergencia_celular: d.emergenciaCelular || null,
      emergencia_parentesco: d.emergenciaParentesco || null,
      deportes: leerDeportes(formData),
      acudiente_id: acudienteId,
    })
    .select("id")
    .single();
  if (error || !cli) return { error: error?.message ?? "No se pudo guardar el cliente." };

  // La fila de titular en `cliente_miembros` (de la que cuelga toda la
  // operación) ya no se crea aquí: la pone el trigger `clientes_crear_titular`
  // (migración 0066). Se movió a la base porque este no era el único sitio que
  // creaba fichas y bastaba con que uno lo olvidara — que fue lo que pasó con
  // el botón de sincronizar EasyCancha: 48 fichas sin titular, y la falla solo
  // se veía semanas después, al cerrar la clase ("Sin deportista").

  await logAudit({
    action: "cliente.create",
    entity: "clientes",
    entityId: String(cli.id),
    after: { nombres: d.nombres, apellidos: d.apellidos, es_menor: menor },
  });

  revalidatePath("/clientes");
  redirect(`/clientes/${cli.id}`);
}

/**
 * Re-engancha las facturas de Siigo del cliente según su identidad de facturación.
 * Reglas de seguridad (mueve plata):
 *  - Solo se atan facturas SIN dueño (cliente_id null): nunca se le quitan a otro cliente.
 *  - Nunca se tocan las conciliadas a mano.
 *  - Se sueltan las que habían quedado atadas por un NIT de facturación que ya no aplica.
 */
async function reatribuirFacturas(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clienteId: number,
  documento: string | null,
  facturaANit: string | null,
) {
  const conservar = new Set([documento, facturaANit].filter(Boolean).map((x) => String(x).trim()));

  // 1) Soltar las atadas por un NIT que ya no corresponde a este cliente.
  const { data: atadas } = await supabase
    .from("siigo_facturas")
    .select("id, cliente_identificacion, estado_conciliacion")
    .eq("cliente_id", clienteId);
  const soltar = (atadas ?? [])
    .filter(
      (f) => f.estado_conciliacion !== "conciliada" && !conservar.has((f.cliente_identificacion ?? "").trim()),
    )
    .map((f) => f.id);
  if (soltar.length) {
    await supabase
      .from("siigo_facturas")
      .update({ cliente_id: null, estado_conciliacion: "pendiente" })
      .in("id", soltar);
  }

  // 2) Atar las del NIT de facturación que hoy no tienen dueño.
  if (facturaANit) {
    const { data: libres } = await supabase
      .from("siigo_facturas")
      .select("id")
      .eq("cliente_identificacion", facturaANit)
      .is("cliente_id", null)
      .neq("estado_conciliacion", "conciliada");
    const atar = (libres ?? []).map((f) => f.id);
    if (atar.length) {
      await supabase
        .from("siigo_facturas")
        .update({ cliente_id: clienteId, estado_conciliacion: "auto" })
        .in("id", atar);
    }
  }
}

/** Edita los datos de un cliente existente (auditado). */
export async function updateCliente(
  _prev: ClienteFormState,
  formData: FormData,
): Promise<ClienteFormState> {
  await requireRole(WRITE_ROLES);
  const id = Number(formData.get("id"));
  if (!id) return { error: "Cliente inválido." };

  const parsed = createClienteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] = issue.message;
    return { error: "Revisa los campos.", fieldErrors };
  }
  const d = parsed.data;
  const menor = esMenorDeEdad(d.fechaNacimiento);

  const supabase = await createClient();
  const { data: actual } = await supabase.from("clientes").select("acudiente_id").eq("id", id).maybeSingle();
  if (!actual) return { error: "Cliente no encontrado." };
  let acudienteId = actual.acudiente_id;

  // Regla dura: un menor exige acudiente (existente o diligenciado ahora).
  if (menor && !d.acudienteNombre && !acudienteId) {
    return {
      error: "Los menores de edad requieren acudiente.",
      fieldErrors: { acudienteNombre: "Nombre del acudiente obligatorio para menores" },
    };
  }

  // Crear o actualizar el acudiente si se diligenció.
  if (d.acudienteNombre) {
    const fields = {
      nombre: d.acudienteNombre,
      documento: d.acudienteDocumento || null,
      telefono: d.acudienteTelefono || null,
      parentesco: d.acudienteParentesco || null,
    };
    if (acudienteId) {
      await supabase.from("acudientes").update(fields).eq("id", acudienteId);
    } else {
      const { data: ac, error: acErr } = await supabase.from("acudientes").insert(fields).select("id").single();
      if (acErr || !ac) return { error: acErr?.message ?? "No se pudo guardar el acudiente." };
      acudienteId = ac.id;
    }
  }

  // "A nombre de quién se factura": no pasa por el schema; se lee directo del form.
  const facturaANombre = String(formData.get("facturaANombre") ?? "").trim() || null;
  const facturaANit = String(formData.get("facturaANit") ?? "").replace(/\D/g, "") || null;

  // Guard: ese NIT no puede pertenecer ya a otro cliente (evita atribuir la plata dos veces).
  if (facturaANit) {
    const { data: choque } = await supabase
      .from("clientes")
      .select("id, nombres, apellidos, documento")
      .or(`documento.eq.${facturaANit},factura_a_nit.eq.${facturaANit}`)
      .neq("id", id)
      .limit(1);
    const otro = choque?.[0];
    if (otro) {
      const motivo = otro.documento === facturaANit ? "es la cédula/NIT" : "ya es el NIT de facturación";
      return {
        error: `Ese NIT ${motivo} de ${otro.nombres} ${otro.apellidos}. Sus facturas le pertenecen a ese cliente.`,
        fieldErrors: { facturaANit: "NIT ya usado por otro cliente" },
      };
    }
  }

  // Datos que el titular comparte con su fila de miembro (se guardan en ambas).
  const propios = {
    nombres: d.nombres,
    apellidos: d.apellidos,
    documento: d.documento || null,
    tipo_documento: leerTipoDocumento(formData, d.documento),
    eps: texto(formData, "eps"),
    rh: leerRh(formData),
    fecha_nacimiento: d.fechaNacimiento || null,
    deportes: leerDeportes(formData),
  };

  const { error } = await supabase
    .from("clientes")
    .update({
      ...propios,
      es_menor: menor,
      celular: d.celular || null,
      email: d.email || null,
      emergencia_nombre: d.emergenciaNombre || null,
      emergencia_celular: d.emergenciaCelular || null,
      emergencia_parentesco: d.emergenciaParentesco || null,
      factura_a_nombre: facturaANombre,
      factura_a_nit: facturaANit,
      factura_tipo: leerFacturaTipo(formData),
      factura_email: texto(formData, "facturaEmail"),
      acudiente_id: acudienteId,
    })
    .eq("id", id);
  if (error) return { error: error.message };

  await sincronizarTitular(supabase, id, propios);
  await reatribuirFacturas(supabase, id, d.documento || null, facturaANit);

  await logAudit({
    action: "cliente.update",
    entity: "clientes",
    entityId: String(id),
    after: { nombres: d.nombres, apellidos: d.apellidos, es_menor: menor },
  });
  revalidatePath("/clientes");
  revalidatePath(`/clientes/${id}`);
  redirect(`/clientes/${id}`);
}

/** Agrega un hermano a la ficha familiar (miembro no titular). */
export async function agregarHermano(
  _prev: ClienteFormState,
  formData: FormData,
): Promise<ClienteFormState> {
  await requireRole(WRITE_ROLES);
  const clienteId = Number(formData.get("clienteId"));
  const nombres = String(formData.get("nombres") ?? "").trim();
  const apellidos = String(formData.get("apellidos") ?? "").trim();
  const fechaNacimiento = String(formData.get("fechaNacimiento") ?? "").trim() || null;
  const documento = String(formData.get("documento") ?? "").trim() || null;
  if (!clienteId) return { error: "Ficha inválida." };
  if (!nombres || !apellidos) {
    return { error: "Nombre y apellido del hermano son obligatorios.", fieldErrors: { nombres: !nombres ? "Requerido" : "", apellidos: !apellidos ? "Requerido" : "" } };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("cliente_miembros").insert({
    cliente_id: clienteId,
    nombres,
    apellidos,
    fecha_nacimiento: fechaNacimiento,
    documento,
    tipo_documento: leerTipoDocumento(formData, documento),
    eps: texto(formData, "eps"),
    rh: leerRh(formData),
    deportes: leerDeportes(formData),
    es_titular: false,
  });
  if (error) return { error: error.message };

  await logAudit({ action: "cliente.hermano.add", entity: "cliente_miembros", entityId: String(clienteId), after: { nombres, apellidos } });
  revalidatePath(`/clientes/${clienteId}`);
  return { ok: `${nombres} agregado a la familia.` };
}

/** Edita los datos de un hermano ya creado (miembro no titular de la ficha). */
export async function editarHermano(
  _prev: ClienteFormState,
  formData: FormData,
): Promise<ClienteFormState> {
  await requireRole(WRITE_ROLES);
  const miembroId = Number(formData.get("miembroId"));
  const clienteId = Number(formData.get("clienteId"));
  const nombres = String(formData.get("nombres") ?? "").trim();
  const apellidos = String(formData.get("apellidos") ?? "").trim();
  const fechaNacimiento = String(formData.get("fechaNacimiento") ?? "").trim() || null;
  const documento = String(formData.get("documento") ?? "").trim() || null;
  if (!miembroId || !clienteId) return { error: "Ficha inválida." };
  if (!nombres || !apellidos) {
    return { error: "Nombre y apellido del hermano son obligatorios.", fieldErrors: { nombres: !nombres ? "Requerido" : "", apellidos: !apellidos ? "Requerido" : "" } };
  }

  const supabase = await createClient();
  const { data: m } = await supabase
    .from("cliente_miembros")
    .select("es_titular")
    .eq("id", miembroId)
    .eq("cliente_id", clienteId)
    .maybeSingle();
  if (!m) return { error: "Ese hermano no pertenece a esta ficha." };
  // El titular se edita desde los datos del cliente, no desde aquí.
  if (m.es_titular) return { error: "El titular se edita en los datos del cliente." };

  const { error } = await supabase
    .from("cliente_miembros")
    .update({
      nombres,
      apellidos,
      fecha_nacimiento: fechaNacimiento,
      documento,
      tipo_documento: leerTipoDocumento(formData, documento),
      eps: texto(formData, "eps"),
      rh: leerRh(formData),
      deportes: leerDeportes(formData),
    })
    .eq("id", miembroId);
  if (error) return { error: error.message };

  await logAudit({ action: "cliente.hermano.update", entity: "cliente_miembros", entityId: String(miembroId), after: { nombres, apellidos } });
  revalidatePath(`/clientes/${clienteId}`);
  return { ok: `${nombres} actualizado.` };
}

/** Quita un hermano de la ficha (no el titular). Bloquea si ya tiene operación. */
export async function quitarHermano(formData: FormData): Promise<void> {
  await requireRole(WRITE_ROLES);
  const miembroId = Number(formData.get("miembroId"));
  const clienteId = Number(formData.get("clienteId"));
  if (!miembroId) return;

  const supabase = await createClient();
  const { data: m } = await supabase.from("cliente_miembros").select("es_titular, nombres").eq("id", miembroId).maybeSingle();
  if (!m || m.es_titular) return; // nunca borrar al titular

  // Si el hermano ya tiene operación, se desactiva (no se borra su historia).
  const [{ count: nIns }, { count: nAsi }, { count: nPq }] = await Promise.all([
    supabase.from("inscripciones").select("*", { count: "exact", head: true }).eq("miembro_id", miembroId),
    supabase.from("asistencias").select("*", { count: "exact", head: true }).eq("miembro_id", miembroId),
    supabase.from("paquetes_cliente").select("*", { count: "exact", head: true }).eq("miembro_id", miembroId),
  ]);
  if ((nIns ?? 0) + (nAsi ?? 0) + (nPq ?? 0) > 0) {
    await supabase.from("cliente_miembros").update({ activo: false }).eq("id", miembroId);
  } else {
    await supabase.from("cliente_miembros").delete().eq("id", miembroId);
  }

  await logAudit({ action: "cliente.hermano.remove", entity: "cliente_miembros", entityId: String(miembroId) });
  revalidatePath(`/clientes/${clienteId}`);
}

/**
 * Corrige la vigencia y el descuento de un paquete YA asignado. Solo SA:
 * asignar es del día a día (recepción), corregir lo asignado no.
 * A propósito NO toca las clases del paquete ni las consumidas: ese contador lo
 * lleva el cierre de clases y a mano dejaría de cuadrar con la asistencia real.
 */
export async function editarPaqueteCliente(
  _prev: ClienteFormState,
  formData: FormData,
): Promise<ClienteFormState> {
  await requireRole(["superadmin"]);
  const paqueteId = Number(formData.get("paqueteId"));
  const clienteId = Number(formData.get("clienteId"));
  const inicia = String(formData.get("inicia_el") ?? "").trim();
  const vence = String(formData.get("vence_el") ?? "").trim() || null;
  const descuento = Number(formData.get("descuento") ?? 0);
  if (!paqueteId || !clienteId) return { error: "Paquete inválido." };
  if (!inicia) return { error: "La fecha de inicio es obligatoria.", fieldErrors: { inicia_el: "Requerido" } };
  if (vence && vence < inicia) {
    return { error: "El paquete no puede vencer antes de empezar.", fieldErrors: { vence_el: "Anterior al inicio" } };
  }
  if (!Number.isFinite(descuento) || descuento < 0 || descuento > 100) {
    return { error: "El descuento va de 0 a 100.", fieldErrors: { descuento: "Fuera de rango" } };
  }

  const supabase = await createClient();
  const { data: pq } = await supabase
    .from("paquetes_cliente")
    .select("estado")
    .eq("id", paqueteId)
    .eq("cliente_id", clienteId)
    .maybeSingle();
  if (!pq) return { error: "Ese paquete no es de este cliente." };
  if (pq.estado === "anulado") return { error: "Ese paquete está anulado." };

  const { error } = await supabase
    .from("paquetes_cliente")
    .update({ inicia_el: inicia, vence_el: vence, descuento_pct: descuento })
    .eq("id", paqueteId);
  if (error) return { error: error.message };

  await logAudit({
    action: "paquete.editar",
    entity: "paquetes_cliente",
    entityId: String(paqueteId),
    after: { inicia_el: inicia, vence_el: vence, descuento_pct: descuento },
  });
  revalidatePath(`/clientes/${clienteId}`);
  return { ok: "Paquete actualizado." };
}

/**
 * Anula un paquete asignado por error. No se borra la fila: puede tener clases
 * enganchadas y su historia importa. Al quedar en `anulado` desaparece solo de
 * todo lo que ofrece saldo, porque esas consultas piden `estado = 'activo'`.
 */
export async function anularPaqueteCliente(
  _prev: ClienteFormState,
  formData: FormData,
): Promise<ClienteFormState> {
  const sa = await requireRole(["superadmin"]);
  const paqueteId = Number(formData.get("paqueteId"));
  const clienteId = Number(formData.get("clienteId"));
  if (!paqueteId || !clienteId) return { error: "Paquete inválido." };

  const supabase = await createClient();
  const { data: pq } = await supabase
    .from("paquetes_cliente")
    .select("estado, clases_consumidas")
    .eq("id", paqueteId)
    .eq("cliente_id", clienteId)
    .maybeSingle();
  if (!pq) return { error: "Ese paquete no es de este cliente." };
  if (pq.estado === "anulado") return { error: "Ese paquete ya está anulado." };

  const { error } = await supabase
    .from("paquetes_cliente")
    .update({ estado: "anulado", anulado_el: new Date().toISOString(), anulado_por: sa.id })
    .eq("id", paqueteId);
  if (error) return { error: error.message };

  await logAudit({
    action: "paquete.anular",
    entity: "paquetes_cliente",
    entityId: String(paqueteId),
    after: { estado: "anulado", clases_consumidas: pq.clases_consumidas },
  });
  revalidatePath(`/clientes/${clienteId}`);
  return { ok: "Paquete anulado." };
}

/** Activa/retira un cliente (auditado). */
export async function toggleEstado(
  _prev: ClienteFormState,
  formData: FormData,
): Promise<ClienteFormState> {
  await requireRole(WRITE_ROLES);

  const id = Number(formData.get("id"));
  const actual = String(formData.get("estado"));
  const nuevo = actual === "activo" ? "retirado" : "activo";

  const supabase = await createClient();
  const { error } = await supabase.from("clientes").update({ estado: nuevo }).eq("id", id);
  if (error) return { error: error.message };

  await logAudit({
    action: "cliente.estado",
    entity: "clientes",
    entityId: String(id),
    after: { estado: nuevo },
  });

  revalidatePath(`/clientes/${id}`);
  revalidatePath("/clientes");
  return {};
}

const DOC_TIPOS = ["consentimiento", "certificado_medico", "otro"] as const;

/** Sube un documento del cliente a Storage + registra metadatos. */
export async function uploadDocumento(
  _prev: ClienteFormState,
  formData: FormData,
): Promise<ClienteFormState> {
  await requireRole(WRITE_ROLES);
  const clienteId = Number(formData.get("clienteId"));
  const tipoRaw = String(formData.get("tipo") || "otro");
  const tipo = (DOC_TIPOS as readonly string[]).includes(tipoRaw)
    ? (tipoRaw as (typeof DOC_TIPOS)[number])
    : "otro";

  const file = formData.get("archivo");
  if (!(file instanceof File) || file.size === 0) return { error: "Selecciona un archivo." };
  if (file.size > 10 * 1024 * 1024) return { error: "El archivo supera 10 MB." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${clienteId}/${Date.now()}-${safeName}`;
  const { error: upErr } = await supabase.storage.from("cliente-docs").upload(path, file);
  if (upErr) return { error: upErr.message };

  const { error: metaErr } = await supabase.from("cliente_documentos").insert({
    cliente_id: clienteId,
    tipo,
    nombre_archivo: file.name,
    storage_path: path,
    uploaded_by: user.id,
  });
  if (metaErr) return { error: metaErr.message };

  await logAudit({
    action: "cliente.documento.upload",
    entity: "cliente_documentos",
    entityId: String(clienteId),
    after: { nombre: file.name, tipo },
  });
  revalidatePath(`/clientes/${clienteId}`);
  return {};
}

/** Elimina un documento (Storage + metadatos). */
export async function deleteDocumento(formData: FormData): Promise<void> {
  await requireRole(WRITE_ROLES);
  const id = Number(formData.get("id"));
  const clienteId = Number(formData.get("clienteId"));
  const path = String(formData.get("path"));

  const supabase = await createClient();
  await supabase.storage.from("cliente-docs").remove([path]);
  await supabase.from("cliente_documentos").delete().eq("id", id);

  await logAudit({
    action: "cliente.documento.delete",
    entity: "cliente_documentos",
    entityId: String(clienteId),
  });
  revalidatePath(`/clientes/${clienteId}`);
}

/** Inscribe al cliente en una academia (desde la ficha del cliente). */
export async function inscribirEnAcademia(
  _prev: ClienteFormState,
  formData: FormData,
): Promise<ClienteFormState> {
  await requireRole(rolesForModule("academias", "edit"));
  const clienteId = Number(formData.get("clienteId"));
  const academiaId = Number(formData.get("academiaId"));
  const plan = Number(formData.get("plan"));
  const descuento = Number(formData.get("descuento") || 0);
  const dias = formData
    .getAll("dias")
    .map((d) => Number(d))
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  if (!academiaId) return { error: "Selecciona una academia." };
  if (![1, 2, 3].includes(plan)) return { error: "Plan inválido." };

  const supabase = await createClient();
  const { error } = await supabase.from("inscripciones").insert({
    academia_id: academiaId,
    cliente_id: clienteId,
    plan_frecuencia: plan,
    descuento_pct: descuento,
    dias,
  });
  if (error) {
    return { error: /duplicate|unique/i.test(error.message) ? "Ya está inscrito en esa academia." : error.message };
  }
  await logAudit({
    action: "academia.inscribir",
    entity: "inscripciones",
    entityId: String(academiaId),
    after: { cliente_id: clienteId, plan, descuento_pct: descuento },
  });
  revalidatePath(`/clientes/${clienteId}`);
  return { ok: "Inscrito en la academia." };
}

/** Asigna un paquete del catálogo al cliente (crea la instancia con su saldo). */
export async function asignarPaquete(
  _prev: ClienteFormState,
  formData: FormData,
): Promise<ClienteFormState> {
  await requireRole(rolesForModule("paquetes", "edit"));
  const clienteId = Number(formData.get("clienteId"));
  const catalogoId = Number(formData.get("catalogoId"));
  const descuento = Number(formData.get("descuento") || 0);
  const inicia = String(formData.get("inicia_el") || "") || new Date().toISOString().slice(0, 10);
  const vence = String(formData.get("vence_el") || "") || null;
  if (!catalogoId) return { error: "Selecciona un paquete." };

  const supabase = await createClient();
  const miembroId = await resolverMiembro(supabase, clienteId, Number(formData.get("miembroId")) || null);
  const { data: cat } = await supabase
    .from("paquetes_catalogo")
    .select("num_clases, nombre")
    .eq("id", catalogoId)
    .single();
  if (!cat) return { error: "Paquete no encontrado." };

  const { error } = await supabase.from("paquetes_cliente").insert({
    cliente_id: clienteId,
    miembro_id: miembroId,
    catalogo_id: catalogoId,
    num_clases: cat.num_clases,
    descuento_pct: descuento,
    estado: "activo",
    inicia_el: inicia,
    vence_el: vence,
  });
  if (error) return { error: error.message };

  // Correo de bienvenida (no bloquea la asignación).
  const { data: cli } = await supabase.from("clientes").select("nombres, email").eq("id", clienteId).maybeSingle();
  if (cli?.email) {
    const { subject, html } = paqueteAsignadoEmail({ nombre: cli.nombres, paquete: cat.nombre, numClases: cat.num_clases, vence });
    const r = await sendEmail({ to: cli.email, subject, html });
    if (!r.ok) console.error("correo paquete:", r.error);
  }

  await logAudit({
    action: "paquete.asignar",
    entity: "paquetes_cliente",
    entityId: String(clienteId),
    after: { catalogo_id: catalogoId, num_clases: cat.num_clases, descuento_pct: descuento, inicia_el: inicia, vence_el: vence },
  });
  revalidatePath(`/clientes/${clienteId}`);
  return { ok: "Paquete asignado." };
}

/**
 * Sincroniza SOLO clientes nuevos desde EasyCancha (los que aún no existen por correo).
 * NUNCA borra ni actualiza los existentes → conserva la edición manual.
 */
export async function sincronizarClientesEC(): Promise<ClienteFormState> {
  await requireRole(WRITE_ROLES);
  const supabase = await createClient();

  // Traer 3 meses (mes a mes, por el límite de la API).
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const bookings: EcBooking[] = [];
  let ecErr: string | null = null;
  for (let i = 0; i < 3; i++) {
    const y = now.getFullYear(), m = now.getMonth() + i;
    const first = new Date(y, m, 1), last = new Date(y, m + 1, 0);
    const f = `${first.getFullYear()}-${pad(first.getMonth() + 1)}-01`;
    const t = `${last.getFullYear()}-${pad(last.getMonth() + 1)}-${pad(last.getDate())}`;
    const { bookings: bk, error } = await getBookings({ from: f, to: t });
    if (error) ecErr = error;
    else bookings.push(...bk);
  }
  if (!bookings.length && ecErr) return { error: `No se pudo consultar EasyCancha: ${ecErr}` };

  const { data: ex } = await supabase.from("clientes").select("email");
  const emailsBD = new Set((ex ?? []).map((c) => (c.email ?? "").toLowerCase()).filter(Boolean));

  const vistos = new Set<string>();
  const nuevos = [];
  for (const b of bookings) {
    const email = (b.userEmail ?? "").trim().toLowerCase();
    if (!email || emailsBD.has(email) || vistos.has(email)) continue;
    vistos.add(email);
    nuevos.push({
      nombres: (b.userFirstName ?? "").trim() || "(sin nombre)",
      apellidos: (b.userLastName ?? "").trim() || "",
      email,
      celular: (b.userPhone ?? "").trim() || null,
      es_menor: false,
    });
  }

  let insertados = 0;
  for (let i = 0; i < nuevos.length; i += 500) {
    const { error } = await supabase.from("clientes").insert(nuevos.slice(i, i + 500));
    if (!error) insertados += Math.min(500, nuevos.length - i);
  }

  await logAudit({ action: "cliente.sync_easycancha", entity: "clientes", after: { agregados: insertados } });
  revalidatePath("/clientes");
  return { ok: insertados > 0 ? `Se agregaron ${insertados} cliente(s) nuevo(s) de EasyCancha.` : "Sin clientes nuevos: todo al día." };
}

/** Miembros (hermanos) activos de una ficha, para elegir a quién inscribir/asignar. */
export async function miembrosDeCliente(
  clienteId: number,
): Promise<{ id: number; nombres: string; apellidos: string; es_titular: boolean }[]> {
  await requireRole(rolesForModule("clientes", "read"));
  if (!clienteId) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("cliente_miembros")
    .select("id, nombres, apellidos, es_titular")
    .eq("cliente_id", clienteId)
    .eq("activo", true)
    .order("es_titular", { ascending: false })
    .order("created_at");
  return data ?? [];
}

/** Busca MIEMBROS (personas) por nombre para inscribir directo, sin pasar por el titular. */
export async function buscarMiembros(
  q: string,
): Promise<{ id: number; clienteId: number; nombres: string; apellidos: string; esTitular: boolean; ficha: string | null }[]> {
  await requireRole(rolesForModule("clientes", "read"));
  const safe = q.replace(/[%,()*]/g, "").trim();
  if (safe.length < 2) return [];
  const supabase = await createClient();
  let mq = supabase
    .from("cliente_miembros")
    .select("id, cliente_id, nombres, apellidos, es_titular")
    .eq("activo", true)
    .order("apellidos")
    .limit(8);
  for (const cl of clausulasBusqueda(safe, ["nombres", "apellidos"])) mq = mq.or(cl);
  const { data } = await mq;
  const cliIds = [...new Set((data ?? []).map((m) => m.cliente_id))];
  const { data: fichas } = cliIds.length
    ? await supabase.from("clientes").select("id, nombres, apellidos").in("id", cliIds)
    : { data: [] as { id: number; nombres: string; apellidos: string }[] };
  const fichaPorId = new Map((fichas ?? []).map((c) => [c.id, `${c.apellidos}, ${c.nombres}`]));
  return (data ?? []).map((m) => ({
    id: m.id,
    clienteId: m.cliente_id,
    nombres: m.nombres,
    apellidos: m.apellidos,
    esTitular: m.es_titular,
    ficha: fichaPorId.get(m.cliente_id) ?? null,
  }));
}

/** Sugerencias para el buscador con autocompletar (máx 8). */
export async function buscarClientes(
  q: string,
): Promise<{ id: number; nombres: string; apellidos: string; celular: string | null }[]> {
  // Además de quien tiene el módulo de clientes, entra quien edita eventos: inscribir a
  // un participante ya registrado pasa por este buscador, y `gestion_eventos` no tiene
  // /clientes. Devuelve solo nombre y celular, y como mucho 8 filas.
  await requireRole([
    ...new Set([...rolesForModule("clientes", "read"), ...rolesForModule("eventos", "edit")]),
  ]);
  const safe = q.replace(/[%,()*]/g, "").trim();
  if (safe.length < 2) return [];
  const supabase = await createClient();
  let query = supabase
    .from("clientes")
    .select("id, nombres, apellidos, celular")
    .order("apellidos")
    .limit(8);
  for (const cl of clausulasBusqueda(safe)) query = query.or(cl);
  const { data } = await query;
  return data ?? [];
}
