import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { ClienteForm } from "./cliente-form";

export default async function NuevoClientePage() {
  await requireRole(rolesForModule("clientes", "edit"));

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <Link href="/clientes" className="text-muted-foreground text-sm hover:underline">
          ← Clientes
        </Link>
        <h1 className="cdaf-headline mt-1">Nuevo cliente</h1>
      </div>
      <ClienteForm />
    </div>
  );
}
