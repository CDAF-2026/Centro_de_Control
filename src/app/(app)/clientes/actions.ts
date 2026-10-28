"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { createClienteSchema, esMenorDeEdad, leerAcudientes, type AcudienteDatos } from "@/lib/validations/cliente";
import { precioAsignacionSchema } from "@/lib/validations/paquete";
import { getBookings, documentoDeBooking, type EcBooking } from "@/lib/easycancha/client";
import { sendEmail } from "@/lib/email/resend";
import { paqueteAsignadoEmail } from "@/lib/email/paquete-asignado";
import type { AppRole, Deporte, TipoDocumento, Rh, FacturaTipo, PaqueteEstado } from "@/lib/database.types";
import { clausulasBusqueda } from "./buscar";
import { reatribuirFacturas } from "@/lib/facturacion";
import { nitSinDv } from "@/lib/nit";
import { claveColaSync, leerBaseConocida, personaYaRegistrada, type BaseConocida } from "@/lib/clientes-match";

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
    lugar_nacimiento: string | null;
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

/** NIT escrito en el formulario. Persona jurídica con "NIT-DV" escrito con guion: se guarda sin DV, como en
 * Siigo (18-oct-2026). Sin guion no se toca: hay NIT que Siigo tiene con el DV pegado (p. ej. 8600352008) y
 * deben seguir enlazando. */
function leerNit(v: FormDataEntryValue | null): string | null {
  const t = String(v ?? "");
  return (/-\s*\d\s*$/.test(t) ? nitSinDv(t) : t.replace(/\D/g, "")) || null;
}

function aFacturaTipo(v: FormDataEntryValue | null): FacturaTipo | null {
  const t = String(v ?? "").trim().toLowerCase();
  return t === "natural" || t === "juridica" ? t : null;
}

type DatoFacturacion = { nombre: string | null; nit: string | null; tipo: FacturaTipo | null; email: string | null };
type DatoFacturacionExtra = DatoFacturacion & { nit: string };

/**
 * "A nombre de quién se factura": no pasa por el schema; se lee directo del form. Desde el 21-oct-2026 la
 * ficha puede tener VARIOS (a un niño le paga el papá o la mamá): el primero va a clientes.factura_* y los
 * demás (`extraNit`…, arreglos paralelos) a `cliente_facturacion_extra`. Si el primero se dejó vacío, el
 * siguiente pasa a ser el primero. Cada adicional necesita su NIT (sin NIT no ata ninguna factura) y un NIT
 * no se repite dentro de la ficha.
 */
async function leerFacturacion(
  supabase: Awaited<ReturnType<typeof createClient>>,
  formData: FormData,
  excluirId?: number,
): Promise<{ principal: DatoFacturacion; extras: DatoFacturacionExtra[] } | { error: ClienteFormState }> {
  const primero: DatoFacturacion = {
    nombre: String(formData.get("facturaANombre") ?? "").trim() || null,
    nit: leerNit(formData.get("facturaANit")),
    tipo: leerFacturaTipo(formData),
    email: texto(formData, "facturaEmail"),
  };
  const col = (k: string) => formData.getAll(k);
  const [nombres, nits, tipos, emails] = [col("extraNombre"), col("extraNit"), col("extraTipo"), col("extraEmail")];
  const adicionales = nits.map((n, i) => ({
    campo: `extraNit${i}`,
    dato: {
      nombre: String(nombres[i] ?? "").trim() || null,
      nit: leerNit(n),
      tipo: aFacturaTipo(tipos[i]),
      email: String(emails[i] ?? "").trim() || null,
    } as DatoFacturacion,
  }));

  const vacio = (d: DatoFacturacion) => !d.nombre && !d.nit && !d.tipo && !d.email;
  const llenos = [{ campo: "facturaANit", dato: primero }, ...adicionales].filter((x, i) => i === 0 || !vacio(x.dato));
  const errores: Record<string, string> = {};
  const vistos = new Set<string>();
  for (const [i, x] of llenos.entries()) {
    if (!x.dato.nit) {
      if (i > 0) errores[x.campo] = "Escribe el NIT o la cédula, o quita este dato";
      continue;
    }
    if (vistos.has(x.dato.nit)) errores[x.campo] = "Este NIT ya está en otro dato de esta ficha";
    vistos.add(x.dato.nit);
  }
  if (Object.keys(errores).length) return { error: { error: "Revisa los datos de facturación.", fieldErrors: errores } };

  for (const x of llenos) {
    const choque = await choqueNitFacturacion(supabase, x.dato.nit, excluirId, x.campo);
    if (choque) return { error: choque };
  }

  const [cabeza, ...resto] = vacio(primero) && llenos.length > 1 ? llenos.slice(1) : llenos;
  return { principal: cabeza.dato, extras: resto.map((x) => x.dato as DatoFacturacionExtra) };
}

/** Deja `cliente_facturacion_extra` de la ficha igual a la lista del formulario. */
async function guardarFacturacionExtra(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clienteId: number,
  extras: DatoFacturacionExtra[],
): Promise<string | null> {
  const { data: actuales, error: leerErr } = await supabase.from("cliente_facturacion_extra").select("id, nit").eq("cliente_id", clienteId);
  if (leerErr) return leerErr.message;
  const porNit = new Map((actuales ?? []).map((a) => [a.nit, a.id]));
  const quedan = new Set(extras.map((e) => e.nit));
  const borrar = (actuales ?? []).filter((a) => !quedan.has(a.nit)).map((a) => a.id);
  if (borrar.length) {
    const { error } = await supabase.from("cliente_facturacion_extra").delete().in("id", borrar);
    if (error) return error.message;
  }
  for (const e of extras) {
    const id = porNit.get(e.nit);
    const { error } = id
      ? await supabase.from("cliente_facturacion_extra").update({ nombre: e.nombre, tipo: e.tipo, email: e.email }).eq("id", id)
      : await supabase.from("cliente_facturacion_extra").insert({ cliente_id: clienteId, nit: e.nit, nombre: e.nombre, tipo: e.tipo, email: e.email });
    if (error) return error.message;
  }
  return null;
}

/**
 * Guard: ese NIT de facturación no puede pertenecer ya a otro cliente (evita atribuir la plata
 * dos veces). Lo usan crear y editar: una sola copia de la regla. Devuelve el error o null.
 * Mira también los datos de facturación adicionales de las demás fichas.
 */
async function choqueNitFacturacion(
  supabase: Awaited<ReturnType<typeof createClient>>,
  facturaANit: string | null,
  excluirId?: number,
  campo = "facturaANit",
): Promise<ClienteFormState | null> {
  if (!facturaANit) return null;
  let q = supabase
    .from("clientes")
    .select("id, nombres, apellidos, documento")
    .or(`documento.eq.${facturaANit},factura_a_nit.eq.${facturaANit}`);
  if (excluirId) q = q.neq("id", excluirId);
  let qe = supabase.from("cliente_facturacion_extra").select("cliente_id").eq("nit", facturaANit);
  if (excluirId) qe = qe.neq("cliente_id", excluirId);
  const [{ data: choque }, { data: choqueExtra }] = await Promise.all([q.limit(1), qe.limit(1)]);
  let otro = choque?.[0];
  if (!otro && choqueExtra?.[0]) {
    const { data } = await supabase.from("clientes").select("id, nombres, apellidos, documento").eq("id", choqueExtra[0].cliente_id).maybeSingle();
    otro = data ?? undefined;
  }
  if (!otro) return null;
  const motivo = otro.documento === facturaANit ? "es la cédula/NIT" : "ya es un NIT de facturación";
  return {
    error: `Ese NIT ${motivo} de ${otro.nombres} ${otro.apellidos}. Sus facturas le pertenecen a ese cliente.`,
    fieldErrors: { [campo]: "NIT ya usado por otro cliente" },
  };
}

/**
 * Guarda el SEGUNDO acudiente de la ficha (padre o madre; el principal vive en
 * `clientes.acudiente_id`). Con datos → crea o actualiza la fila que no es la
 * principal; sin datos y con los bloques visibles → la borra. Devuelve el error
 * de la base si lo hay (p. ej. dos "madre" en la misma ficha).
 */
async function guardarSegundoAcudiente(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clienteId: number,
  principalId: number | null,
  segundo: AcudienteDatos | null,
  bloquesVisibles: boolean,
): Promise<string | null> {
  let q = supabase.from("acudientes").select("id").eq("cliente_id", clienteId);
  if (principalId) q = q.neq("id", principalId);
  const { data: existente } = await q.order("id").limit(1).maybeSingle();

  if (segundo) {
    const { error } = existente
      ? await supabase.from("acudientes").update(segundo).eq("id", existente.id)
      : await supabase.from("acudientes").insert({ ...segundo, cliente_id: clienteId });
    return error ? mensajeAcudiente(error.message) : null;
  }
  // Sin segundo en un formulario que SÍ mostró los bloques: lo quitaron a propósito.
  if (existente && bloquesVisibles) {
    const { error } = await supabase.from("acudientes").delete().eq("id", existente.id);
    return error ? error.message : null;
  }
  return null;
}

/** El índice único de rol habla en clave; se traduce para quien está guardando. */
function mensajeAcudiente(msg: string): string {
  return /acudientes_rol_uidx/.test(msg)
    ? "La ficha ya tiene un acudiente con ese rol (padre o madre). Cambia el rol de uno de los dos."
    : msg;
}

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
  const { principal, segundo } = leerAcudientes(d);

  // Regla dura: un menor exige acudiente.
  if (menor && !principal) {
    return {
      error: "Los menores de edad requieren acudiente.",
      fieldErrors: { acudienteNombre: "Nombre del acudiente obligatorio para menores" },
    };
  }

  const supabase = await createClient();

  // Se valida ANTES de crear el acudiente, para no dejar uno huérfano si el NIT choca.
  const fact = await leerFacturacion(supabase, formData);
  if ("error" in fact) return fact.error;

  // El principal nace sin ficha (todavía no existe) y el trigger
  // `clientes_acudiente_principal` lo ata al insertar la ficha.
  let acudienteId: number | null = null;
  if (menor && principal) {
    const { data: ac, error: acErr } = await supabase.from("acudientes").insert(principal).select("id").single();
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
      lugar_nacimiento: d.lugarNacimiento || null,
      direccion: d.direccion || null,
      es_menor: menor,
      celular: d.celular || null,
      email: d.email || null,
      emergencia_nombre: d.emergenciaNombre || null,
      emergencia_celular: d.emergenciaCelular || null,
      emergencia_parentesco: d.emergenciaParentesco || null,
      emergencia_documento: d.emergenciaDocumento?.replace(/\D/g, "") || null,
      emergencia_email: d.emergenciaEmail?.toLowerCase() || null,
      factura_a_nombre: fact.principal.nombre,
      factura_a_nit: fact.principal.nit,
      factura_tipo: fact.principal.tipo,
      factura_email: fact.principal.email,
      deportes: leerDeportes(formData),
      acudiente_id: acudienteId,
    })
    .select("id")
    .single();
  if (error || !cli) return { error: error?.message ?? "No se pudo guardar el cliente." };

  if (menor && segundo) {
    const err = await guardarSegundoAcudiente(supabase, cli.id, acudienteId, segundo, true);
    if (err) return { error: err };
  }

  if (fact.extras.length) {
    const err = await guardarFacturacionExtra(supabase, cli.id, fact.extras);
    if (err) return { error: err };
  }

  // Igual que al editar: las facturas sin dueño de sus NIT de facturación se le atan.
  if (fact.principal.nit || fact.extras.length) await reatribuirFacturas(supabase, cli.id);

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
  const { principal, segundo } = leerAcudientes(d);
  // El formulario solo pinta los bloques de acudiente para menores; si no vinieron,
  // no se toca lo que ya hay (un adulto que fue menor conserva su acudiente).
  const bloquesVisibles = formData.get("acudientesVisibles") === "1";

  // Regla dura: un menor exige acudiente (existente o diligenciado ahora).
  if (menor && !principal && !acudienteId) {
    return {
      error: "Los menores de edad requieren acudiente.",
      fieldErrors: { acudienteNombre: "Nombre del acudiente obligatorio para menores" },
    };
  }

  // Crear o actualizar el principal si se diligenció.
  if (principal) {
    if (acudienteId) {
      const { error: acErr } = await supabase.from("acudientes").update(principal).eq("id", acudienteId);
      if (acErr) return { error: mensajeAcudiente(acErr.message) };
    } else {
      const { data: ac, error: acErr } = await supabase
        .from("acudientes")
        .insert({ ...principal, cliente_id: id })
        .select("id")
        .single();
      if (acErr || !ac) return { error: mensajeAcudiente(acErr?.message ?? "No se pudo guardar el acudiente.") };
      acudienteId = ac.id;
    }
  }
  if (bloquesVisibles) {
    const err = await guardarSegundoAcudiente(supabase, id, acudienteId, segundo, true);
    if (err) return { error: err };
  }

  const fact = await leerFacturacion(supabase, formData, id);
  if ("error" in fact) return fact.error;

  // Datos que el titular comparte con su fila de miembro (se guardan en ambas).
  const propios = {
    nombres: d.nombres,
    apellidos: d.apellidos,
    documento: d.documento || null,
    tipo_documento: leerTipoDocumento(formData, d.documento),
    eps: texto(formData, "eps"),
    rh: leerRh(formData),
    fecha_nacimiento: d.fechaNacimiento || null,
    lugar_nacimiento: d.lugarNacimiento || null,
    deportes: leerDeportes(formData),
  };

  const { error } = await supabase
    .from("clientes")
    .update({
      ...propios,
      es_menor: menor,
      direccion: d.direccion || null,
      celular: d.celular || null,
      email: d.email || null,
      emergencia_nombre: d.emergenciaNombre || null,
      emergencia_celular: d.emergenciaCelular || null,
      emergencia_parentesco: d.emergenciaParentesco || null,
      emergencia_documento: d.emergenciaDocumento?.replace(/\D/g, "") || null,
      emergencia_email: d.emergenciaEmail?.toLowerCase() || null,
      factura_a_nombre: fact.principal.nombre,
      factura_a_nit: fact.principal.nit,
      factura_tipo: fact.principal.tipo,
      factura_email: fact.principal.email,
      acudiente_id: acudienteId,
    })
    .eq("id", id);
  if (error) return { error: error.message };

  const errExtra = await guardarFacturacionExtra(supabase, id, fact.extras);
  if (errExtra) return { error: errExtra };

  await sincronizarTitular(supabase, id, propios);
  await reatribuirFacturas(supabase, id);

  await logAudit({
    action: "cliente.update",
    entity: "clientes",
    entityId: String(id),
    after: { nombres: d.nombres, apellidos: d.apellidos, es_menor: menor, factura_a_nit: fact.principal.nit, facturacion_extra: fact.extras.map((e) => e.nit) },
  });
  revalidatePath("/clientes");
  revalidatePath(`/clientes/${id}`);
  redirect(`/clientes/${id}`);
}

/** Agrega un hijo o hermano a la ficha familiar (miembro no titular). */
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
    return { error: "Nombre y apellido son obligatorios.", fieldErrors: { nombres: !nombres ? "Requerido" : "", apellidos: !apellidos ? "Requerido" : "" } };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("cliente_miembros").insert({
    cliente_id: clienteId,
    nombres,
    apellidos,
    fecha_nacimiento: fechaNacimiento,
    lugar_nacimiento: texto(formData, "lugarNacimiento"),
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
    return { error: "Nombre y apellido son obligatorios.", fieldErrors: { nombres: !nombres ? "Requerido" : "", apellidos: !apellidos ? "Requerido" : "" } };
  }

  const supabase = await createClient();
  const { data: m } = await supabase
    .from("cliente_miembros")
    .select("es_titular")
    .eq("id", miembroId)
    .eq("cliente_id", clienteId)
    .maybeSingle();
  if (!m) return { error: "Esa persona no pertenece a esta ficha." };
  // El titular se edita desde los datos del cliente, no desde aquí.
  if (m.es_titular) return { error: "El titular se edita en los datos del cliente." };

  const { error } = await supabase
    .from("cliente_miembros")
    .update({
      nombres,
      apellidos,
      fecha_nacimiento: fechaNacimiento,
      lugar_nacimiento: texto(formData, "lugarNacimiento"),
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
 * Corrige la vigencia y el precio de un paquete YA asignado. Solo SA:
 * asignar es del día a día (recepción), corregir lo asignado no. Cambiar el
 * precio mueve la nómina de las clases ya cerradas de ese paquete (la
 * liquidación lee precio ÷ clases en vivo), por eso queda en auditoría.
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
  if (!paqueteId || !clienteId) return { error: "Paquete inválido." };
  if (!inicia) return { error: "La fecha de inicio es obligatoria.", fieldErrors: { inicia_el: "Requerido" } };
  if (vence && vence < inicia) {
    return { error: "El paquete no puede vencer antes de empezar.", fieldErrors: { vence_el: "Anterior al inicio" } };
  }
  const precioParsed = precioAsignacionSchema.safeParse(formData.get("precio"));
  if (!precioParsed.success) {
    const msg = precioParsed.error.issues[0]?.message ?? "Escribe el precio del paquete.";
    return { error: msg, fieldErrors: { precio: msg } };
  }
  const precio = precioParsed.data;

  const supabase = await createClient();
  const { data: pq } = await supabase
    .from("paquetes_cliente")
    .select("estado, num_clases, clases_consumidas, precio")
    .eq("id", paqueteId)
    .eq("cliente_id", clienteId)
    .maybeSingle();
  if (!pq) return { error: "Ese paquete no es de este cliente." };
  if (pq.estado === "anulado") return { error: "Ese paquete está anulado." };

  // ⚠️ El estado se RECALCULA desde la vigencia y el saldo. Sin esto, extenderle
  // la fecha a un paquete vencido no servía de nada: se quedaba en `vencido` y
  // seguía sin ofrecerse, porque todas las listas piden `estado = 'activo'`.
  // El anulado ya salió arriba: ese no revive por cambiarle una fecha.
  const hoy = new Date().toISOString().slice(0, 10);
  const saldo = pq.num_clases - pq.clases_consumidas;
  const estado: PaqueteEstado =
    saldo <= 0 ? "agotado" : vence != null && vence < hoy ? "vencido" : "activo";

  const { error } = await supabase
    .from("paquetes_cliente")
    .update({ inicia_el: inicia, vence_el: vence, precio, estado })
    .eq("id", paqueteId);
  if (error) return { error: error.message };

  await logAudit({
    action: "paquete.editar",
    entity: "paquetes_cliente",
    entityId: String(paqueteId),
    before: { estado: pq.estado, precio: pq.precio },
    after: { inicia_el: inicia, vence_el: vence, precio, estado, clases_consumidas: pq.clases_consumidas },
  });
  revalidatePath(`/clientes/${clienteId}`);
  return {
    ok:
      pq.estado === "vencido" && estado === "activo"
        ? "Vigencia extendida: el paquete vuelve a estar disponible."
        : "Paquete actualizado.",
  };
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

/** Asigna un paquete del catálogo al cliente (crea la instancia con su saldo). */
export async function asignarPaquete(
  _prev: ClienteFormState,
  formData: FormData,
): Promise<ClienteFormState> {
  await requireRole(rolesForModule("paquetes", "edit"));
  const clienteId = Number(formData.get("clienteId"));
  const catalogoId = Number(formData.get("catalogoId"));
  const inicia = String(formData.get("inicia_el") || "") || new Date().toISOString().slice(0, 10);
  const vence = String(formData.get("vence_el") || "") || null;
  if (!catalogoId) return { error: "Selecciona un paquete." };
  // El precio es de ESTE cliente, no del catálogo, y nunca puede quedar en cero:
  // la nómina paga precio ÷ clases, así que un cero le pagaría $0 al profesor.
  const precioParsed = precioAsignacionSchema.safeParse(formData.get("precio"));
  if (!precioParsed.success) {
    const msg = precioParsed.error.issues[0]?.message ?? "Escribe el precio del paquete.";
    return { error: msg, fieldErrors: { precio: msg } };
  }
  const precio = precioParsed.data;

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
    precio,
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
    after: { catalogo_id: catalogoId, num_clases: cat.num_clases, precio, inicia_el: inicia, vence_el: vence },
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

  // DOBLE VALIDACIÓN: correo Y cédula. Mirar solo el correo fue lo que partió en
  // dos la ficha de Karent Coronado (15-sep-2026) — EasyCancha traía
  // `karentcoronadop@` y su ficha decía `karentcoronado@`, una letra, y esto le
  // creó una ficha nueva SIN sus paquetes. La cédula venía en la reserva y era
  // la misma en las dos. De 17 nombres repetidos, 8 eran duplicados de verdad.
  // Y no solo contra el titular: también los hijos y sus acudientes (caso
  // Maximiliano Pimienta, 7-oct-2026, en `personaYaRegistrada`).
  let base: BaseConocida;
  try {
    base = await leerBaseConocida(supabase);
  } catch (e) {
    return { error: `No se pudo leer la base de clientes: ${e instanceof Error ? e.message : String(e)}` };
  }

  const vistos = new Set<string>();
  const nuevos = [];
  let omitidosPorCedula = 0;
  let omitidosPorFamilia = 0;
  const enEstaCorrida = new Set<string>();
  for (const b of bookings) {
    const email = (b.userEmail ?? "").trim().toLowerCase();
    if (!email || vistos.has(email)) continue;

    // Ya está en la base con otro correo, o es alguien de una familia que reserva
    // con el correo o el celular de la mamá o el papá: NO se crea una segunda ficha.
    const doc = documentoDeBooking(b);
    const ya = personaYaRegistrada(
      { email, documento: doc?.documento ?? null, nombres: b.userFirstName ?? null, apellidos: b.userLastName ?? null, celular: b.userPhone ?? null },
      base,
    );
    if (ya === "correo") continue;
    if (ya === "documento") {
      omitidosPorCedula++;
      continue;
    }
    if (ya === "familia") {
      omitidosPorFamilia++;
      continue;
    }

    // La misma persona con dos cuentas en la misma corrida (Sofía Dávila: dos correos,
    // un celular, 28-oct-2026) no puede salir como dos fichas nuevas.
    const enCola = claveColaSync(b.userFirstName ?? null, b.userLastName ?? null, b.userPhone ?? null);
    if (enCola && enEstaCorrida.has(enCola)) continue;
    if (enCola) enEstaCorrida.add(enCola);

    vistos.add(email);
    // La cédula se GUARDA (antes no se guardaba, aunque EasyCancha la manda):
    // es lo que hará que la próxima reserva de esta persona encuentre ESTA
    // ficha aunque venga con otro correo. Al medir, 157 de 496 clientes (32%)
    // no tenían cédula, y son justo los que se pueden volver a duplicar.
    if (doc) base.documentos.add(doc.documento);
    nuevos.push({
      nombres: (b.userFirstName ?? "").trim() || "(sin nombre)",
      apellidos: (b.userLastName ?? "").trim() || "",
      email,
      celular: (b.userPhone ?? "").trim() || null,
      documento: doc?.documento ?? null,
      tipo_documento: doc?.tipo ?? null,
      fecha_nacimiento: (b.userBirthDate ?? "").trim() || null,
      es_menor: false,
    });
  }

  let insertados = 0;
  for (let i = 0; i < nuevos.length; i += 500) {
    const { error } = await supabase.from("clientes").insert(nuevos.slice(i, i + 500));
    if (!error) insertados += Math.min(500, nuevos.length - i);
  }

  const conDoc = nuevos.filter((n) => n.documento).length;
  await logAudit({
    action: "cliente.sync_easycancha",
    entity: "clientes",
    after: { agregados: insertados, con_cedula: conDoc, omitidos_por_cedula: omitidosPorCedula, omitidos_por_familia: omitidosPorFamilia },
  });
  revalidatePath("/clientes");
  // Se dice cuántos se saltaron y por qué: es la señal de que el club ya tiene a
  // esa persona, no de que algo falló.
  const nota =
    (omitidosPorCedula > 0 ? ` ${omitidosPorCedula} ya estaba(n) con otro correo (se reconocieron por la cédula).` : "") +
    (omitidosPorFamilia > 0 ? ` ${omitidosPorFamilia} ya estaba(n) en la ficha de su familia (mismo correo o celular).` : "");
  return {
    ok: insertados > 0
      ? `Se agregaron ${insertados} cliente(s) nuevo(s) de EasyCancha, ${conDoc} con cédula.${nota}`
      : `Sin clientes nuevos: todo al día.${nota}`,
  };
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
