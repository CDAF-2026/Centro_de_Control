"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { createClienteSchema, esMenorDeEdad } from "@/lib/validations/cliente";
import type { AppRole } from "@/lib/database.types";

const WRITE_ROLES: AppRole[] = ["superadmin", "coord_admin", "recepcion"];

export type ClienteFormState = {
  error?: string;
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
      fecha_nacimiento: d.fechaNacimiento || null,
      es_menor: menor,
      celular: d.celular || null,
      email: d.email || null,
      contacto_emergencia: d.contactoEmergencia || null,
      acudiente_id: acudienteId,
    })
    .select("id")
    .single();
  if (error || !cli) return { error: error?.message ?? "No se pudo guardar el cliente." };

  await logAudit({
    action: "cliente.create",
    entity: "clientes",
    entityId: String(cli.id),
    after: { nombres: d.nombres, apellidos: d.apellidos, es_menor: menor },
  });

  revalidatePath("/clientes");
  redirect(`/clientes/${cli.id}`);
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
