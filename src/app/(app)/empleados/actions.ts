"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import {
  createEmpleadoSchema,
  updateEmpleadoSchema,
  valorClaseSchema,
  reglasSchema,
  STAFF_ROLES,
} from "@/lib/validations/empleado";
import { asignarPasswordSchema } from "@/lib/validations/perfil";
import type { EmpleadoDocumentoTipo } from "@/lib/database.types";

export type EmpleadoFormState = {
  error?: string;
  ok?: string;
  fieldErrors?: Record<string, string>;
};

/** Crea un empleado + su cuenta (Admin API). Solo superadministrador. */
export async function createEmpleado(
  _prev: EmpleadoFormState,
  formData: FormData,
): Promise<EmpleadoFormState> {
  const sa = await requireRole(["superadmin"]);

  const parsed = createEmpleadoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[String(issue.path[0])] = issue.message;
    }
    return { error: "Revisa los campos.", fieldErrors };
  }
  const d = parsed.data;

  // 1) Crear la cuenta (confirmada) con la Admin API.
  const admin = createAdminClient();
  const { data: created, error } = await admin.auth.admin.createUser({
    email: d.email,
    password: d.password,
    email_confirm: true,
    user_metadata: { nombre: d.nombre },
  });
  if (error || !created.user) {
    const msg = error?.message ?? "";
    return {
      error: /registered|exists/i.test(msg)
        ? "Ese correo ya tiene una cuenta."
        : msg || "No se pudo crear la cuenta.",
    };
  }
  const userId = created.user.id;

  // 2) Completar el perfil (vía RLS, como el SA autenticado).
  const supabase = await createClient();
  const { error: upErr } = await supabase
    .from("profiles")
    .update({
      role: d.role,
      nombre: d.nombre,
      documento: d.documento || null,
      telefono: d.telefono || null,
    })
    .eq("id", userId);
  if (upErr) return { error: `Cuenta creada, pero falló el perfil: ${upErr.message}` };

  // 3) Valor de clase inicial para profesores.
  if (d.role === "profesor" && d.valorClase) {
    const { error: vErr } = await supabase.from("profesor_valor_clase").insert({
      profesor_id: userId,
      valor: parseInt(d.valorClase, 10),
      created_by: sa.id,
    });
    if (vErr) return { error: `Empleado creado, pero falló el valor de clase: ${vErr.message}` };
  }

  // 4) Contrato adjunto (opcional).
  const contrato = formData.get("contrato");
  if (contrato instanceof File && contrato.size > 0 && contrato.size <= 10 * 1024 * 1024) {
    const path = `${userId}/${Date.now()}-${contrato.name}`;
    const { error: cErr } = await supabase.storage.from("empleado-docs").upload(path, contrato);
    if (!cErr) {
      await supabase.from("empleado_documentos").insert({
        empleado_id: userId,
        tipo: "contrato",
        nombre_archivo: contrato.name,
        storage_path: path,
        uploaded_by: sa.id,
      });
    }
  }

  await logAudit({
    action: "empleado.create",
    entity: "profiles",
    entityId: userId,
    after: { email: d.email, role: d.role },
  });

  revalidatePath("/empleados");
  redirect("/empleados");
}

/** Registra un nuevo valor de clase (queda en el historial). Solo superadministrador. */
export async function updateValorClase(
  _prev: EmpleadoFormState,
  formData: FormData,
): Promise<EmpleadoFormState> {
  const sa = await requireRole(["superadmin"]);

  const parsed = valorClaseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("profesor_valor_clase").insert({
    profesor_id: parsed.data.profesorId,
    valor: parsed.data.valor,
    created_by: sa.id,
  });
  if (error) return { error: error.message };

  await logAudit({
    action: "valor_clase.update",
    entity: "profesor_valor_clase",
    entityId: parsed.data.profesorId,
    after: { valor: parsed.data.valor },
  });

  revalidatePath(`/empleados/${parsed.data.profesorId}`);
  return {};
}

/** Guarda la compensación del profesor (tipo + montos) y el valor por alumno de sus academias. */
export async function guardarCompensacion(
  _prev: EmpleadoFormState,
  formData: FormData,
): Promise<EmpleadoFormState> {
  await requireRole(rolesForModule("empleados", "edit"));

  const profesorId = String(formData.get("profesorId") || "");
  const tipo = String(formData.get("tipo") || "");
  if (!profesorId) return { error: "Falta el profesor." };
  if (!["por_clase", "fijo_comision", "fisico"].includes(tipo)) return { error: "Tipo de compensación inválido." };

  const num = (k: string) => Math.max(0, Math.round(Number(formData.get(k)) || 0));
  const pct = Math.min(100, Math.max(0, Number(formData.get("pct_clase")) || 0));

  const supabase = await createClient();
  const { error } = await supabase.from("profesor_compensacion").upsert({
    profesor_id: profesorId,
    tipo: tipo as "por_clase" | "fijo_comision" | "fisico",
    pct_clase: pct,
    salario_fijo: num("salario_fijo"),
    pago_asistencia: num("pago_asistencia"),
    comision_quincenal: num("comision_quincenal"),
    valor_alumno_academia: num("valor_alumno_academia"),
    updated_at: new Date().toISOString(),
  });
  if (error) return { error: error.message };

  await logAudit({ action: "compensacion.update", entity: "profesor_compensacion", entityId: profesorId, after: { tipo } });
  revalidatePath(`/empleados/${profesorId}`);
  return { ok: "Compensación guardada." };
}

/**
 * Guarda el conjunto de reglas de compensación de un profesor (modelo flexible).
 * Reemplaza todas sus reglas por el set recibido; un set vacío lo devuelve al modelo viejo.
 */
export async function guardarReglas(
  _prev: EmpleadoFormState,
  formData: FormData,
): Promise<EmpleadoFormState> {
  await requireRole(rolesForModule("empleados", "edit"));

  const profesorId = String(formData.get("profesorId") || "");
  if (!profesorId) return { error: "Falta el profesor." };

  let payload: unknown;
  try {
    payload = JSON.parse(String(formData.get("reglas") || "[]"));
  } catch {
    return { error: "No se pudieron leer las reglas." };
  }
  const parsed = reglasSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisa las reglas." };
  }

  const esClaseMetodo = (m: string) =>
    ["pct_facturado", "fijo_por_clase", "escalonado_asistentes", "por_alumno"].includes(m);
  const rows = parsed.data.map((r, i) => ({
    profesor_id: profesorId,
    nombre: r.nombre,
    concepto: r.concepto,
    metodo: r.metodo,
    pct: r.metodo === "pct_facturado" || r.metodo === "pct_siigo_servicio" || r.metodo === "comision_umbral" ? r.pct : 0,
    valor: r.metodo === "fijo_por_clase" || r.metodo === "por_alumno" || r.metodo === "salario_fijo" ? r.valor : 0,
    servicio_id: r.metodo === "pct_siigo_servicio" ? r.servicio_id : null,
    escalones: r.metodo === "escalonado_asistentes" ? r.escalones : null,
    // Filtro día/hora: solo para reglas de clase con franja (no aplica al tope mensual).
    dias: esClaseMetodo(r.metodo) && r.metodo !== "comision_umbral" && r.dias && r.dias.length ? r.dias : null,
    hora_desde: esClaseMetodo(r.metodo) && r.metodo !== "comision_umbral" ? r.hora_desde : null,
    hora_hasta: esClaseMetodo(r.metodo) && r.metodo !== "comision_umbral" ? r.hora_hasta : null,
    umbral: r.metodo === "comision_umbral" ? r.umbral : null,
    orden: i,
    activo: true,
  }));

  const supabase = await createClient();
  // Reemplaza el set completo (borra + inserta): simple y correcto para pocas reglas.
  const { error: delErr } = await supabase.from("profesor_regla").delete().eq("profesor_id", profesorId);
  if (delErr) return { error: delErr.message };
  if (rows.length) {
    const { error: insErr } = await supabase.from("profesor_regla").insert(rows);
    if (insErr) return { error: insErr.message };
  }

  await logAudit({
    action: "reglas.update",
    entity: "profesor_regla",
    entityId: profesorId,
    after: { reglas: rows.length },
  });
  revalidatePath(`/empleados/${profesorId}`);
  return { ok: rows.length ? "Reglas guardadas." : "Reglas eliminadas (vuelve al modelo anterior)." };
}

/** Edita datos del empleado (nombre, correo, documento, teléfono). Solo superadministrador. */
export async function updateEmpleado(
  _prev: EmpleadoFormState,
  formData: FormData,
): Promise<EmpleadoFormState> {
  await requireRole(["superadmin"]);
  const parsed = updateEmpleadoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] = issue.message;
    return { error: "Revisa los campos.", fieldErrors };
  }
  const d = parsed.data;

  // Correo (vía Admin API) — solo si se especificó uno (los profesores sin correo real quedan vacíos).
  // `email_confirm: true` va explícito: sin él el correo nuevo puede quedar a la
  // espera de una confirmación que hoy nadie recibe (los correos de Auth todavía
  // no salen por Resend), y la persona no podría entrar con su correo nuevo.
  // Es lo mismo que ya hace `createEmpleado` al abrir la cuenta.
  if (d.email) {
    const admin = createAdminClient();
    const { error: eErr } = await admin.auth.admin.updateUserById(d.id, {
      email: d.email,
      email_confirm: true,
    });
    if (eErr) {
      return { error: /registered|exists/i.test(eErr.message) ? "Ese correo ya está en uso." : eErr.message };
    }
  }

  // Perfil.
  const supabase = await createClient();
  const { error: upErr } = await supabase
    .from("profiles")
    .update({ nombre: d.nombre, documento: d.documento || null, telefono: d.telefono || null })
    .eq("id", d.id);
  if (upErr) return { error: upErr.message };

  await logAudit({
    action: "empleado.update",
    entity: "profiles",
    entityId: d.id,
    after: { nombre: d.nombre, email: d.email },
  });
  revalidatePath("/empleados");
  revalidatePath(`/empleados/${d.id}`);
  redirect(`/empleados/${d.id}`);
}

// ─────────────────────── Acceso a la plataforma ───────────────────────

/** Cambia el rol de otra persona (qué módulos ve). Solo superadministrador. */
export async function cambiarRolEmpleado(
  _prev: EmpleadoFormState,
  formData: FormData,
): Promise<EmpleadoFormState> {
  const sa = await requireRole(["superadmin"]);
  const id = String(formData.get("id") || "");
  const role = String(formData.get("role") || "");

  if (!id) return { error: "Falta el empleado." };
  if (!(STAFF_ROLES as readonly string[]).includes(role)) return { error: "Rol inválido." };
  // Sin esto, el único superadministrador podría degradarse solo y dejar al
  // club sin nadie que pueda volver a repartir permisos.
  if (id === sa.id) {
    return { error: "No puedes cambiar tu propio rol. Debe hacerlo otro superadministrador." };
  }

  const supabase = await createClient();
  const { data: antes } = await supabase.from("profiles").select("role").eq("id", id).single();
  const { error } = await supabase
    .from("profiles")
    .update({ role: role as (typeof STAFF_ROLES)[number] })
    .eq("id", id);
  if (error) return { error: error.message };

  await logAudit({
    action: "empleado.rol.update",
    entity: "profiles",
    entityId: id,
    before: { role: antes?.role ?? null },
    after: { role },
  });

  revalidatePath("/empleados");
  revalidatePath(`/empleados/${id}`);
  return { ok: "Rol actualizado." };
}

/**
 * Da o quita el acceso a la plataforma. Solo superadministrador.
 *
 * Se tocan DOS sitios a propósito:
 *   · `profiles.activo` — lo que consulta la app (`requireProfile` lo usa para
 *     cerrarle la sesión y devolverlo al login).
 *   · el bloqueo en Auth (`ban_duration`) — invalida el token de refresco, así
 *     que la sesión que ya tuviera abierta tampoco se renueva.
 * Con solo lo primero, quien estuviera dentro seguiría navegando hasta cerrar
 * el navegador; con solo lo segundo, la app no sabría por qué no puede entrar.
 */
export async function cambiarAccesoEmpleado(
  _prev: EmpleadoFormState,
  formData: FormData,
): Promise<EmpleadoFormState> {
  const sa = await requireRole(["superadmin"]);
  const id = String(formData.get("id") || "");
  const activo = String(formData.get("activo")) === "1";

  if (!id) return { error: "Falta el empleado." };
  if (id === sa.id && !activo) {
    return { error: "No puedes quitarte el acceso a ti mismo." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ activo }).eq("id", id);
  if (error) return { error: error.message };

  const admin = createAdminClient();
  // 876000h ≈ 100 años: es la forma que tiene Supabase de decir "indefinido".
  const { error: authErr } = await admin.auth.admin.updateUserById(id, {
    ban_duration: activo ? "none" : "876000h",
  });
  if (authErr) {
    // Se revierte para no dejar el perfil y la cuenta contándose cosas distintas.
    await supabase.from("profiles").update({ activo: !activo }).eq("id", id);
    return { error: `No se pudo cambiar el acceso: ${authErr.message}` };
  }

  await logAudit({
    action: activo ? "empleado.acceso.dar" : "empleado.acceso.quitar",
    entity: "profiles",
    entityId: id,
    after: { activo },
  });

  revalidatePath("/empleados");
  revalidatePath(`/empleados/${id}`);
  return { ok: activo ? "Acceso restablecido." : "Acceso retirado." };
}

/**
 * Asigna una contraseña nueva a otra persona. Solo superadministrador.
 * Es el camino de recuperación mientras no haya envío de correos configurado:
 * el superadministrador la fija y se la entrega a la persona.
 */
export async function asignarPasswordEmpleado(
  _prev: EmpleadoFormState,
  formData: FormData,
): Promise<EmpleadoFormState> {
  await requireRole(["superadmin"]);

  const parsed = asignarPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] = i.message;
    return { error: "Revisa los campos.", fieldErrors };
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(parsed.data.id, {
    password: parsed.data.password,
  });
  if (error) return { error: error.message };

  await logAudit({ action: "empleado.password.asignar", entity: "profiles", entityId: parsed.data.id });

  revalidatePath(`/empleados/${parsed.data.id}`);
  return { ok: "Contraseña asignada. Entrégasela a la persona." };
}

/** Sube un documento (contrato, etc.) del empleado. Solo superadmin / coord. administrativo. */
export async function uploadEmpleadoDocumento(
  _prev: EmpleadoFormState,
  formData: FormData,
): Promise<EmpleadoFormState> {
  await requireRole(rolesForModule("empleados", "edit"));
  const empleadoId = String(formData.get("empleadoId"));
  const tipoRaw = String(formData.get("tipo") || "contrato");
  const tipo = (["contrato", "hoja_vida", "otro"].includes(tipoRaw) ? tipoRaw : "otro") as EmpleadoDocumentoTipo;
  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) return { error: "Selecciona un archivo." };
  if (archivo.size > 10 * 1024 * 1024) return { error: "El archivo supera 10 MB." };

  const supabase = await createClient();
  const path = `${empleadoId}/${Date.now()}-${archivo.name}`;
  const { error: upErr } = await supabase.storage.from("empleado-docs").upload(path, archivo);
  if (upErr) return { error: upErr.message };

  const { data: { user } } = await supabase.auth.getUser();
  const { error: metaErr } = await supabase.from("empleado_documentos").insert({
    empleado_id: empleadoId,
    tipo,
    nombre_archivo: archivo.name,
    storage_path: path,
    uploaded_by: user?.id ?? null,
  });
  if (metaErr) return { error: metaErr.message };

  await logAudit({ action: "empleado.documento.upload", entity: "empleado_documentos", entityId: empleadoId, after: { tipo } });
  revalidatePath(`/empleados/${empleadoId}`);
  return { ok: "Documento subido." };
}

/** Elimina un documento del empleado (Storage + metadatos). */
export async function deleteEmpleadoDocumento(formData: FormData): Promise<void> {
  await requireRole(rolesForModule("empleados", "edit"));
  const id = Number(formData.get("id"));
  const empleadoId = String(formData.get("empleadoId"));
  const path = String(formData.get("path"));

  const supabase = await createClient();
  await supabase.storage.from("empleado-docs").remove([path]);
  await supabase.from("empleado_documentos").delete().eq("id", id);

  await logAudit({ action: "empleado.documento.delete", entity: "empleado_documentos", entityId: empleadoId });
  revalidatePath(`/empleados/${empleadoId}`);
}

/**
 * Prende o apaga "registra turnos" para una persona.
 *
 * Va por PERSONA y no por rol a propósito: los cuatro que marcan hoy son de
 * roles distintos (recepción, coord. administrativo y seguridad), y marcar turno
 * es una condición del contrato, no un módulo. Lo blinda además el trigger
 * `profiles_blindar_rol`: si cualquiera pudiera apagárselo desde "Mi perfil",
 * desaparecería de la nómina por horas sin que nadie lo note.
 */
export async function cambiarMarcaTurno(
  _prev: EmpleadoFormState,
  formData: FormData,
): Promise<EmpleadoFormState> {
  await requireRole(["superadmin"]);
  const id = String(formData.get("id") ?? "");
  const marca = String(formData.get("marca") ?? "") === "1";
  if (!id) return { error: "Empleado inválido." };

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ marca_turno: marca }).eq("id", id);
  if (error) return { error: error.message };

  await logAudit({
    action: "empleado.marca_turno",
    entity: "profiles",
    entityId: id,
    after: { marca_turno: marca },
  });

  revalidatePath(`/empleados/${id}`);
  revalidatePath("/", "layout"); // la entrada "Mi turno" del menú depende de esto
  return { ok: marca ? "Ahora registra turnos." : "Ya no registra turnos." };
}

/** Asigna el PIN de 4 dígitos con el que marca en el PC de recepción. */
export async function asignarPinTurno(
  _prev: EmpleadoFormState,
  formData: FormData,
): Promise<EmpleadoFormState> {
  await requireRole(["superadmin"]);
  const id = String(formData.get("id") ?? "");
  const pin = String(formData.get("pin") ?? "").trim();
  if (!id) return { error: "Empleado inválido." };
  if (!/^\d{4}$/.test(pin)) {
    return { error: "El PIN son 4 dígitos.", fieldErrors: { pin: "4 dígitos" } };
  }

  // El PIN NO se registra en la bitácora: eso lo hace la función, y guarda solo
  // que se asignó, nunca el número.
  const supabase = await createClient();
  const { error } = await supabase.rpc("turno_pin_asignar", { p_perfil: id, p_pin: pin });
  if (error) return { error: error.message };

  revalidatePath(`/empleados/${id}`);
  return { ok: "PIN asignado." };
}

/** Quita el PIN. Sigue pudiendo marcar desde su celular: son dos puertas. */
export async function borrarPinTurno(
  _prev: EmpleadoFormState,
  formData: FormData,
): Promise<EmpleadoFormState> {
  await requireRole(["superadmin"]);
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Empleado inválido." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("turno_pin_borrar", { p_perfil: id });
  if (error) return { error: error.message };

  revalidatePath(`/empleados/${id}`);
  return { ok: "PIN eliminado." };
}
