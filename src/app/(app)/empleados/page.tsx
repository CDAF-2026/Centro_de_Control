import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { rolesForModule, can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { ROLE_LABEL } from "@/lib/roles";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

export default async function EmpleadosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const profile = await requireRole(rolesForModule("empleados"));
  const { q = "" } = await searchParams;
  const safe = q.replace(/[%,()*]/g, "").trim();

  const supabase = await createClient();
  let query = supabase
    .from("profiles")
    .select("id, nombre, documento, telefono, role, activo")
    .order("nombre", { nullsFirst: false });
  if (safe) query = query.or(`nombre.ilike.%${safe}%,documento.ilike.%${safe}%`);
  const { data: empleados } = await query;

  const puedeEditar = can(profile.role, "empleados", "edit");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="cdaf-headline">Empleados</h1>
        {puedeEditar && (
          <Link href="/empleados/nuevo" className={buttonVariants()}>
            + Nuevo empleado
          </Link>
        )}
      </div>

      <form className="max-w-sm">
        <Input name="q" defaultValue={q} placeholder="Buscar por nombre o documento…" />
      </form>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="px-4 py-2 font-semibold">Nombre</th>
              <th className="px-4 py-2 font-semibold">Documento</th>
              <th className="px-4 py-2 font-semibold">Rol</th>
              <th className="px-4 py-2 font-semibold">Contacto</th>
              <th className="px-4 py-2 font-semibold">Estado</th>
            </tr>
          </thead>
          <tbody>
            {(empleados ?? []).map((e) => (
              <tr key={e.id} className="hover:bg-muted/30 border-t">
                <td className="px-4 py-2">
                  <Link href={`/empleados/${e.id}`} className="font-medium hover:underline">
                    {e.nombre ?? "—"}
                  </Link>
                </td>
                <td className="px-4 py-2">{e.documento ?? "—"}</td>
                <td className="px-4 py-2">{ROLE_LABEL[e.role]}</td>
                <td className="px-4 py-2">{e.telefono ?? "—"}</td>
                <td className="px-4 py-2">
                  {e.activo ? (
                    <Badge variant="secondary">Activo</Badge>
                  ) : (
                    <Badge variant="outline">Inactivo</Badge>
                  )}
                </td>
              </tr>
            ))}
            {(!empleados || empleados.length === 0) && (
              <tr>
                <td colSpan={5} className="text-muted-foreground px-4 py-6 text-center">
                  Sin empleados que coincidan.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
