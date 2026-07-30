import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { mapaNombresStaff, profesoresParaFiltrar } from "@/lib/staff";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { buttonVariants } from "@/components/ui/button";
import { ClienteAutocomplete } from "@/components/cliente-autocomplete";
import { CierreToast } from "./cierre-toast";
import { EmptyState } from "@/components/ui/empty-state";
import { CalendarCheck } from "lucide-react";

export default async function CierrePage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; profesor?: string; cliente?: string }>;
}) {
  const profile = await requireRole(rolesForModule("cierre_clase"));
  const sp = await searchParams;
  const esProfesor = profile.role === "profesor";
  const esSuperadmin = profile.role === "superadmin";
  const profesorFilter = !esProfesor ? (sp.profesor || "") : "";
  const clienteFilter = Number(sp.cliente) || 0;

  const supabase = await createClient();

  // Solo clases que YA EMPEZARON. La fecha se filtra en la consulta y la hora
  // después, porque una clase de hoy a las 18:00 no se puede cerrar a las 10:00:
  // sería marcar asistencia de algo que no ha pasado, y encima cuenta para la
  // liquidación. El servidor lo vuelve a validar al guardar (cierre/actions.ts).
  const hoyD = new Date();
  const hoyIso = `${hoyD.getFullYear()}-${String(hoyD.getMonth() + 1).padStart(2, "0")}-${String(hoyD.getDate()).padStart(2, "0")}`;

  let q = supabase
    .from("clases")
    .select("id, fecha, hora_inicio, tipo, deporte, profesor_id, cliente_id, academia_id")
    .eq("estado", "programada")
    .lte("fecha", hoyIso)
    .order("fecha");
  if (esProfesor) q = q.eq("profesor_id", profile.id);
  else if (profesorFilter) q = q.eq("profesor_id", profesorFilter);
  if (clienteFilter) q = q.eq("cliente_id", clienteFilter);
  const { data: clases } = await q;
  const ahoraMs = Date.now();
  const lista = (clases ?? []).filter(
    (c) => new Date(`${c.fecha}T${c.hora_inicio ?? "00:00"}:00`).getTime() <= ahoraMs,
  );

  // Listas para los filtros (solo staff que ve varias clases).
  // Incluye inactivos: quien ya no está pudo dar las clases que se consultan.
  const profesores = !esProfesor ? await profesoresParaFiltrar() : [];
  let clienteFilterName = "";
  if (clienteFilter) {
    const { data } = await supabase.from("clientes").select("nombres, apellidos").eq("id", clienteFilter).maybeSingle();
    if (data) clienteFilterName = `${data.apellidos}, ${data.nombres}`;
  }

  // Nombres de profesor / deportista (individual) / academia
  const profIds = [...new Set(lista.map((c) => c.profesor_id).filter((x): x is string => !!x))];
  const cliIds = [...new Set(lista.filter((c) => c.tipo === "individual").map((c) => c.cliente_id).filter((x): x is number => x != null))];
  const acaIds = [...new Set(lista.map((c) => c.academia_id).filter((x): x is number => x != null))];

  const profName = new Map<string, string>((profesores).map((p) => [p.id, p.nombre ?? "—"]));
  if (profIds.length) {
    const faltan = profIds.filter((id) => !profName.has(id));
    if (faltan.length) {
      const nombres = await mapaNombresStaff();
      for (const id of faltan) profName.set(id, nombres.get(id) ?? "—");
    }
  }
  const cliName = new Map<number, string>();
  if (cliIds.length) {
    const { data } = await supabase.from("clientes").select("id, nombres, apellidos").in("id", cliIds);
    for (const c of data ?? []) cliName.set(c.id, `${c.nombres} ${c.apellidos}`);
  }
  const acaName = new Map<number, string>();
  if (acaIds.length) {
    const { data } = await supabase.from("academias").select("id, nombre").in("id", acaIds);
    for (const a of data ?? []) acaName.set(a.id, a.nombre);
  }

  const now = Date.now();
  const hayFiltro = !!profesorFilter || !!clienteFilter;

  return (
    <div className="space-y-6">
      {sp.ok && <CierreToast estado={sp.ok} />}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="cdaf-headline">
          {esProfesor ? "Mis clases por cerrar" : "Clases pendientes de cierre"}
        </h1>
        {esSuperadmin && (
          <div className="flex items-center gap-2">
            <Link href="/cierre/vencidas" className={buttonVariants({ variant: "outline", size: "sm" })}>Clases vencidas</Link>
            <Link href="/cierre/cerradas" className={buttonVariants({ variant: "outline", size: "sm" })}>Clases cerradas</Link>
          </div>
        )}
      </div>

      {!esProfesor && (
        <form className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="profesor">Profesor</Label>
            <select id="profesor" name="profesor" defaultValue={profesorFilter} className="border-input bg-background h-9 rounded-md border px-3 text-sm">
              <option value="">Todos</option>
              {profesores.map((p) => <option key={p.id} value={p.id}>{p.nombre ?? p.id}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Cliente</Label>
            <ClienteAutocomplete name="cliente" initialId={clienteFilter || undefined} initialLabel={clienteFilterName || undefined} />
          </div>
          <button type="submit" className={buttonVariants({ variant: "outline" })}>Filtrar</button>
          {hayFiltro && <Link href="/cierre" className={buttonVariants({ variant: "ghost" })}>Limpiar</Link>}
        </form>
      )}

      {lista.length === 0 && (
        <EmptyState
          icon={CalendarCheck}
          title={hayFiltro ? "No hay clases pendientes con esos filtros" : "No hay clases pendientes"}
          description={hayFiltro ? "Prueba quitar los filtros." : "¡Todo al día! 🎾"}
        />
      )}

      <div className="space-y-2">
        {lista.map((c) => {
          const dt = new Date(`${c.fecha}T${c.hora_inicio ?? "23:59"}:00`);
          const vencida = now > dt.getTime() + 24 * 3600 * 1000;
          const quien =
            c.tipo === "academia"
              ? `Academia: ${c.academia_id ? acaName.get(c.academia_id) ?? "—" : "—"}`
              : c.cliente_id ? cliName.get(c.cliente_id) ?? "—" : "Sin deportista";
          const profe = c.profesor_id ? profName.get(c.profesor_id) ?? "—" : "Sin profesor";
          return (
            <div key={c.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div>
                <p className="font-medium">{quien}</p>
                <p className="text-muted-foreground text-sm">
                  {c.fecha} {c.hora_inicio?.slice(0, 5) ?? ""} ·{" "}
                  {c.tipo === "academia" ? "Academia" : "Individual"}
                  {c.deporte ? ` · ${c.deporte}` : ""} · Profe: {profe}
                </p>
                {vencida && <Badge variant="destructive" className="mt-1">+24 h sin cerrar</Badge>}
              </div>
              <Link href={`/cierre/${c.id}`} className={buttonVariants({ size: "sm" })}>Cerrar</Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
