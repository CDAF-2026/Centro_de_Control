import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { ClienteForm } from "../../cliente-form";

export default async function EditarClientePage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(rolesForModule("clientes", "edit"));
  const { id } = await params;

  const supabase = await createClient();
  const { data: cliente } = await supabase
    .from("clientes")
    .select("id, nombres, apellidos, documento, tipo_documento, eps, rh, fecha_nacimiento, lugar_nacimiento, direccion, celular, email, emergencia_nombre, emergencia_celular, emergencia_parentesco, factura_a_nombre, factura_a_nit, factura_tipo, factura_email, deportes, acudiente_id")
    .eq("id", Number(id))
    .maybeSingle();
  if (!cliente) notFound();

  // Identidades de facturación que ya existen en Siigo (autocompletar del campo).
  const { data: identidades } = await supabase.rpc("siigo_clientes_facturacion");

  // Los acudientes de la ficha: el principal es `acudiente_id`; el segundo, el otro (si hay).
  const { data: acudientes } = await supabase
    .from("acudientes")
    .select("id, nombre, documento, telefono, email, parentesco, rol")
    .eq("cliente_id", cliente.id)
    .order("id");
  const acudiente = (acudientes ?? []).find((a) => a.id === cliente.acudiente_id) ?? null;
  const acudiente2 = (acudientes ?? []).find((a) => a.id !== cliente.acudiente_id) ?? null;

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <Link href={`/clientes/${cliente.id}`} className="text-muted-foreground text-sm hover:underline">
          ← Volver a la ficha
        </Link>
        <h1 className="cdaf-headline mt-1">Editar cliente</h1>
      </div>
      <ClienteForm cliente={cliente} acudiente={acudiente} acudiente2={acudiente2} identidadesSiigo={identidades ?? []} />
    </div>
  );
}
