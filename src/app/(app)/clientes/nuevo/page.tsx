import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { ClienteForm } from "../cliente-form";

export default async function NuevoClientePage() {
  await requireRole(rolesForModule("clientes", "edit"));

  // Identidades de facturación que ya existen en Siigo (autocompletar del campo).
  const supabase = await createClient();
  const { data: identidades } = await supabase.rpc("siigo_clientes_facturacion");

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <Link href="/clientes" className="text-muted-foreground text-sm hover:underline">
          ← Clientes
        </Link>
        <h1 className="cdaf-headline mt-1">Nuevo cliente</h1>
      </div>
      <ClienteForm identidadesSiigo={identidades ?? []} />
    </div>
  );
}
