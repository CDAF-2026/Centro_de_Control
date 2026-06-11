"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { createEmpleadoSchema, updateEmpleadoSchema, valorClaseSchema } from "@/lib/validations/empleado";
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

  // Correo (vía Admin API).
  const admin = createAdminClient();
  const { error: eErr } = await admin.auth.admin.updateUserById(d.id, { email: d.email });
  if (eErr) {
    return { error: /registered|exists/i.test(eErr.message) ? "Ese correo ya está en uso." : eErr.message };
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

/** Sube un documento (contrato, etc.) del empleado. Solo superadmin / coord. administrativo. */
export async function uploadEmpleadoDocumento(
  _prev: EmpleadoFormState,
  formData: FormData,
): Promise<EmpleadoFormState> {
  await requireRole(["superadmin", "coord_admin"]);
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
  await requireRole(["superadmin", "coord_admin"]);
  const id = Number(formData.get("id"));
  const empleadoId = String(formData.get("empleadoId"));
  const path = String(formData.get("path"));

  const supabase = await createClient();
  await supabase.storage.from("empleado-docs").remove([path]);
  await supabase.from("empleado_documentos").delete().eq("id", id);

  await logAudit({ action: "empleado.documento.delete", entity: "empleado_documentos", entityId: empleadoId });
  revalidatePath(`/empleados/${empleadoId}`);
}
