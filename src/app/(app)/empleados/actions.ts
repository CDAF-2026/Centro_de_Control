"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { createEmpleadoSchema, valorClaseSchema } from "@/lib/validations/empleado";

export type EmpleadoFormState = {
  error?: string;
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
    await supabase.from("profesor_valor_clase").insert({
      profesor_id: userId,
      valor: parseInt(d.valorClase, 10),
      created_by: sa.id,
    });
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
