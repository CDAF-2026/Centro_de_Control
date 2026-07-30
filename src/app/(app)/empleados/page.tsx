import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { rolesForModule, can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { correoVisible } from "@/lib/empleado";

export default async function EmpleadosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; inactivos?: string }>;
}) {
  const profile = await requireRole(rolesForModule("empleados"));
  const { q = "", inactivos } = await searchParams;
  const safe = q.replace(/[%,()*]/g, "").trim();
  const verInactivos = inactivos === "1";

  const supabase = await createClient();
  // Por defecto solo los activos (los inactivos son duplicados unificados o
  // gente que ya no trabaja aquí), pero se pueden mostrar: sin verlos no habría
  // forma de devolverle el acceso a alguien que volvió.
  let query = supabase
    .from("profiles")
    .select("id, nombre, telefono, activo")
    .order("nombre", { nullsFirst: false });
  if (!verInactivos) query = query.eq("activo", true);
  if (safe) query = query.or(`nombre.ilike.%${safe}%,documento.ilike.%${safe}%`);
  const { data: empleados } = await query;

  // Correos desde Auth (placeholders ocultos por correoVisible).
  const admin = createAdminClient();
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const emailById = new Map((list?.users ?? []).map((u) => [u.id, u.email ?? ""]));

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

      <div className="flex flex-wrap items-center gap-3">
        <form className="max-w-sm flex-1">
          <Input name="q" defaultValue={q} placeholder="Buscar por nombre o documento…" />
          {verInactivos && <input type="hidden" name="inactivos" value="1" />}
        </form>
        <Link
          href={`/empleados?${new URLSearchParams({ ...(q ? { q } : {}), ...(verInactivos ? {} : { inactivos: "1" }) })}`}
          className="text-muted-foreground text-sm hover:underline"
        >
          {verInactivos ? "Ver solo activos" : "Mostrar también los inactivos"}
        </Link>
      </div>

      <div className="cdaf-table-wrap">
        <table className="cdaf-table">
          <thead>
            <tr>
              <th className="px-4 py-2 font-semibold">Nombre</th>
              <th className="px-4 py-2 font-semibold">Teléfono</th>
              <th className="px-4 py-2 font-semibold">Correo</th>
              <th className="px-4 py-2 font-semibold">Estado</th>
            </tr>
          </thead>
          <tbody>
            {(empleados ?? []).map((e) => {
              const correo = correoVisible(emailById.get(e.id));
              return (
                <tr key={e.id} className="hover:bg-muted/30 border-t">
                  <td className="px-4 py-2">
                    <Link href={`/empleados/${e.id}`} className="font-medium hover:underline">
                      {e.nombre ?? "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{e.telefono ?? "—"}</td>
                  <td className="px-4 py-2 break-all">{correo || <span className="text-muted-foreground">Sin correo</span>}</td>
                  <td className="px-4 py-2">
                    {e.activo ? (
                      <Badge variant="secondary">Activo</Badge>
                    ) : (
                      <Badge variant="outline">Inactivo</Badge>
                    )}
                  </td>
                </tr>
              );
            })}
            {(!empleados || empleados.length === 0) && (
              <tr>
                <td colSpan={4}>
                  <EmptyState icon={Users} title="Sin empleados que coincidan" description="Ajusta la búsqueda o agrega un nuevo empleado." />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
