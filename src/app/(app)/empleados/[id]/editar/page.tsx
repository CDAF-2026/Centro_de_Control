import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { EditarEmpleadoForm } from "../editar-empleado-form";
import { correoVisible } from "@/lib/empleado";

export default async function EditarEmpleadoPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(["superadmin"]);
  const { id } = await params;

  const supabase = await createClient();
  const { data: emp } = await supabase
    .from("profiles")
    .select("id, nombre, documento, telefono")
    .eq("id", id)
    .maybeSingle();
  if (!emp) notFound();

  const admin = createAdminClient();
  const { data: u } = await admin.auth.admin.getUserById(id);
  const email = correoVisible(u?.user?.email);

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <Link href={`/empleados/${id}`} className="text-muted-foreground text-sm hover:underline">
          ← Volver a la ficha
        </Link>
        <h1 className="cdaf-headline mt-1">Editar empleado</h1>
      </div>
      <EditarEmpleadoForm
        empleado={{ id: emp.id, nombre: emp.nombre ?? "", email, documento: emp.documento, telefono: emp.telefono }}
      />
    </div>
  );
}
