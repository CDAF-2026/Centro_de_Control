import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { rolesForModule, can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SyncClientesButton } from "./sync-clientes-button";
import { ClienteBuscador } from "./cliente-buscador";
import { clausulasBusqueda } from "./buscar";
import { EmptyState } from "@/components/ui/empty-state";
import { Users } from "lucide-react";

const PAGE_SIZE = 30;

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; estado?: string; page?: string }>;
}) {
  const profile = await requireRole(rolesForModule("clientes"));
  const { q = "", estado = "", page: pageRaw } = await searchParams;
  const safe = q.replace(/[%,()*]/g, "").trim();
  const page = Math.max(1, Number(pageRaw) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = await createClient();
  let query = supabase
    .from("clientes")
    .select("id, nombres, apellidos, celular, estado, es_menor, deportes", { count: "exact" })
    .order("apellidos")
    .range(from, to);
  for (const cl of clausulasBusqueda(safe)) query = query.or(cl);
  if (estado === "activo" || estado === "retirado") query = query.eq("estado", estado);
  const { data: clientes, count } = await query;

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const desde = total === 0 ? 0 : from + 1;
  const hasta = Math.min(from + PAGE_SIZE, total);
  const pageHref = (n: number) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (estado) p.set("estado", estado);
    if (n > 1) p.set("page", String(n));
    const s = p.toString();
    return s ? `/clientes?${s}` : "/clientes";
  };

  const puedeEditar = can(profile.role, "clientes", "edit");
  const exportarHref = (() => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (estado) p.set("estado", estado);
    const s = p.toString();
    return s ? `/clientes/exportar?${s}` : "/clientes/exportar";
  })();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="cdaf-headline">Clientes / Deportistas</h1>
        {puedeEditar && (
          <div className="flex flex-wrap items-center gap-2">
            <SyncClientesButton />
            <a href={exportarHref} className={buttonVariants({ variant: "outline" })}>
              Descargar CSV
            </a>
            <Link href="/clientes/importar" className={buttonVariants({ variant: "outline" })}>
              Importar CSV
            </Link>
            <Link href="/clientes/nuevo" className={buttonVariants()}>
              + Nuevo cliente
            </Link>
          </div>
        )}
      </div>

      <form className="flex flex-wrap items-center gap-3">
        <ClienteBuscador defaultValue={q} />
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

      <div className="cdaf-table-wrap">
        <table className="cdaf-table">
          <thead>
            <tr>
              <th className="px-4 py-2 font-semibold">Nombre</th>
              <th className="px-4 py-2 font-semibold">Celular</th>
              <th className="px-4 py-2 font-semibold">Deportes</th>
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
                    <Badge variant="outline" className="ml-2">Menor</Badge>
                  )}
                </td>
                <td className="px-4 py-2">{c.celular ?? "—"}</td>
                <td className="px-4 py-2">
                  {(c.deportes ?? []).length > 0 ? (
                    <span className="flex flex-wrap gap-1">
                      {(c.deportes ?? []).map((d) => (
                        <Badge key={d} variant="outline">{d === "tenis" ? "Tenis" : "Pádel"}</Badge>
                      ))}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
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
                <td colSpan={4}>
                  <EmptyState icon={Users} title="Sin clientes que coincidan" description="Ajusta la búsqueda o agrega un nuevo cliente." />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground">
          {total === 0 ? "0 clientes" : `${desde}–${hasta} de ${total} · Página ${page} de ${totalPages}`}
        </span>
        <div className="flex items-center gap-2">
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>← Anterior</Link>
          ) : (
            <span className={`${buttonVariants({ variant: "outline", size: "sm" })} pointer-events-none opacity-40`}>← Anterior</span>
          )}
          {page < totalPages ? (
            <Link href={pageHref(page + 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>Siguiente →</Link>
          ) : (
            <span className={`${buttonVariants({ variant: "outline", size: "sm" })} pointer-events-none opacity-40`}>Siguiente →</span>
          )}
        </div>
      </div>
    </div>
  );
}
