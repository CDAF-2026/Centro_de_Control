import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { rolesForModule, can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; estado?: string }>;
}) {
  const profile = await requireRole(rolesForModule("clientes"));
  const { q = "", estado = "" } = await searchParams;
  const safe = q.replace(/[%,()*]/g, "").trim();

  const supabase = await createClient();
  let query = supabase
    .from("clientes")
    .select("id, nombres, apellidos, documento, celular, estado, es_menor")
    .order("apellidos");
  if (safe) query = query.or(`nombres.ilike.%${safe}%,apellidos.ilike.%${safe}%,documento.ilike.%${safe}%`);
  if (estado === "activo" || estado === "retirado") query = query.eq("estado", estado);
  const { data: clientes } = await query;

  const puedeEditar = can(profile.role, "clientes", "edit");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="cdaf-headline">Clientes / Deportistas</h1>
        {puedeEditar && (
          <Link href="/clientes/nuevo" className={buttonVariants()}>
            + Nuevo cliente
          </Link>
        )}
      </div>

      <form className="flex flex-wrap items-center gap-3">
        <Input name="q" defaultValue={q} placeholder="Buscar por nombre o documento…" className="max-w-xs" />
        <select
          name="estado"
          defaultValue={estado}
          className="border-input bg-background h-9 rounded-md border px-3 text-sm"
        >
          <option value="">Todos</option>
          <option value="activo">Activos</option>
          <option value="retirado">Retirados</option>
        </select>
        <button type="submit" className={buttonVariants({ variant: "outline" })}>
          Filtrar
        </button>
      </form>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="px-4 py-2 font-semibold">Nombre</th>
              <th className="px-4 py-2 font-semibold">Documento</th>
              <th className="px-4 py-2 font-semibold">Celular</th>
              <th className="px-4 py-2 font-semibold">Estado</th>
            </tr>
          </thead>
          <tbody>
            {(clientes ?? []).map((c) => (
              <tr key={c.id} className="hover:bg-muted/30 border-t">
                <td className="px-4 py-2">
                  <Link href={`/clientes/${c.id}`} className="font-medium hover:underline">
                    {c.apellidos}, {c.nombres}
                  </Link>
                  {c.es_menor && (
                    <Badge variant="outline" className="ml-2">
                      Menor
                    </Badge>
                  )}
                </td>
                <td className="px-4 py-2">{c.documento ?? "—"}</td>
                <td className="px-4 py-2">{c.celular ?? "—"}</td>
                <td className="px-4 py-2">
                  {c.estado === "activo" ? (
                    <Badge variant="secondary">Activo</Badge>
                  ) : (
                    <Badge variant="outline">Retirado</Badge>
                  )}
                </td>
              </tr>
            ))}
            {(!clientes || clientes.length === 0) && (
              <tr>
                <td colSpan={4} className="text-muted-foreground px-4 py-6 text-center">
                  Sin clientes que coincidan.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
