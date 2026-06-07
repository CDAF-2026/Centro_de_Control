import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { EmpleadoForm } from "./empleado-form";

export default async function NuevoEmpleadoPage() {
  await requireRole(["superadmin"]);

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <Link href="/empleados" className="text-muted-foreground text-sm hover:underline">
          ← Empleados
        </Link>
        <h1 className="cdaf-headline mt-1">Nuevo empleado</h1>
      </div>
      <EmpleadoForm />
    </div>
  );
}
