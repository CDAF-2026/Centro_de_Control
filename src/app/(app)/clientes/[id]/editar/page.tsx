import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EditarClienteForm } from "../editar-form";

export default async function EditarClientePage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(["superadmin", "coord_admin", "recepcion"]);
  const { id } = await params;

  const supabase = await createClient();
  const { data: cliente } = await supabase
    .from("clientes")
    .select("id, nombres, apellidos, documento, fecha_nacimiento, celular, email, emergencia_nombre, emergencia_celular, emergencia_parentesco, deportes, acudiente_id")
    .eq("id", Number(id))
    .maybeSingle();
  if (!cliente) notFound();

  let acudiente = null;
  if (cliente.acudiente_id) {
    const { data } = await supabase
      .from("acudientes")
      .select("nombre, documento, telefono, parentesco")
      .eq("id", cliente.acudiente_id)
      .maybeSingle();
    acudiente = data ?? null;
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <Link href={`/clientes/${cliente.id}`} className="text-muted-foreground text-sm hover:underline">
          ← Volver a la ficha
        </Link>
        <h1 className="cdaf-headline mt-1">Editar cliente</h1>
      </div>
      <EditarClienteForm cliente={cliente} acudiente={acudiente} />
    </div>
  );
}
