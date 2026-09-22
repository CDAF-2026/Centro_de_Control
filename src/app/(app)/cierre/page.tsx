import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { mapaNombresStaff, profesoresParaFiltrar } from "@/lib/staff";
import { nombresDeportistas } from "@/lib/deportistas";
import { instanteClase } from "@/lib/fecha";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { buttonVariants } from "@/components/ui/button";
import { ClienteAutocomplete } from "@/components/cliente-autocomplete";
import { CierreToast } from "./cierre-toast";
import { abrirClaseDelPlaneador } from "./actions";
import { EmptyState } from "@/components/ui/empty-state";
import { CalendarCheck } from "lucide-react";

export default async function CierrePage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; aviso?: string; profesor?: string; cliente?: string }>;
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
    .select("id, fecha, hora_inicio, tipo, deporte, profesor_id, cliente_id, miembro_id, academia_id")
    .eq("estado", "programada")
    .lte("fecha", hoyIso)
    .order("fecha");
  if (esProfesor) q = q.eq("profesor_id", profile.id);
  else if (profesorFilter) q = q.eq("profesor_id", profesorFilter);
  if (clienteFilter) q = q.eq("cliente_id", clienteFilter);
  const { data: clases } = await q;
  const ahoraMs = Date.now();
  const lista = (clases ?? []).filter(
    (c) => instanteClase(c.fecha, c.hora_inicio) <= ahoraMs,
  );

  // Las academias NO se registran de antemano: la programación es la misma todas
  // las semanas, así que se le pregunta al planeador qué debió dictarse. La fila
  // de `clases` nace al cerrar. Se mira una ventana de 30 días para que la cola
  // del día a día siga siendo legible; lo más viejo lo ve el SA en /cierre/vencidas.
  const VENTANA_DIAS = 30;
  const desde = new Date(hoyD);
  desde.setDate(desde.getDate() - VENTANA_DIAS);
  const desdeIso = `${desde.getFullYear()}-${String(desde.getMonth() + 1).padStart(2, "0")}-${String(desde.getDate()).padStart(2, "0")}`;
  const { data: delPlaneador } = clienteFilter
    ? { data: [] }  // el filtro por cliente es de clases individuales; una academia no tiene una sola ficha
    : await supabase.rpc("academia_pendientes", {
        p_desde: desdeIso,
        p_hasta: hoyIso,
        p_profesor: esProfesor ? profile.id : profesorFilter || null,
      });
  const pendientesPlan = (delPlaneador ?? []).filter(
    (p) => instanteClase(p.fecha, p.hora_inicio) <= ahoraMs,
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
  const profIds = [...new Set(
    [...lista.map((c) => c.profesor_id), ...pendientesPlan.map((p) => p.profesor_id)]
      .filter((x): x is string => !!x),
  )];
  const acaIds = [...new Set(lista.map((c) => c.academia_id).filter((x): x is number => x != null))];

  const profName = new Map<string, string>((profesores).map((p) => [p.id, p.nombre ?? "—"]));
  if (profIds.length) {
    const faltan = profIds.filter((id) => !profName.has(id));
    if (faltan.length) {
      const nombres = await mapaNombresStaff();
      for (const id of faltan) profName.set(id, nombres.get(id) ?? "—");
    }
  }
  // El deportista sale de `cliente_miembros`, NO de `clientes`: al profesor la
  // segunda le devuelve cero filas por RLS y todas sus clases salían con "—".
  const deportista = await nombresDeportistas(
    supabase,
    lista.filter((c) => c.tipo !== "academia"),
  );
  const acaName = new Map<number, string>();
  if (acaIds.length) {
    const { data } = await supabase.from("academias").select("id, nombre").in("id", acaIds);
    for (const a of data ?? []) acaName.set(a.id, a.nombre);
  }

  const now = Date.now();
  const hayFiltro = !!profesorFilter || !!clienteFilter;
  // En receso no se reprocha nada: si nadie la cierra, está bien. Por eso no
  // entra en el conteo ni lleva el badge de vencida.
  const enReceso = pendientesPlan.filter((p) => p.en_receso).length;
  const nRecla = lista.length + pendientesPlan.length - enReceso;

  return (
    <div className="space-y-6">
      {sp.ok && <CierreToast estado={sp.ok} />}
      {sp.aviso && (
        <p className="border-destructive/40 bg-destructive/5 text-destructive rounded-xl border px-4 py-3 text-sm">
          {sp.aviso}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="cdaf-headline">
            {esProfesor ? "Mis clases por cerrar" : "Clases pendientes de cierre"}
          </h1>
          {nRecla > 0 && (
            <p className="text-muted-foreground mt-1.5 text-sm tabular-nums">
              {nRecla} {nRecla === 1 ? "pendiente" : "pendientes"}
              {enReceso > 0 && ` · ${enReceso} más en semana de receso, que no se reprochan`}
            </p>
          )}
        </div>
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

      {lista.length + pendientesPlan.length === 0 && (
        <EmptyState
          icon={CalendarCheck}
          title={hayFiltro ? "No hay clases pendientes con esos filtros" : "No hay clases pendientes"}
          description={hayFiltro ? "Prueba quitar los filtros." : "¡Todo al día! 🎾"}
        />
      )}

      {pendientesPlan.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="cdaf-title text-base">
              Academias · {pendientesPlan.length} {pendientesPlan.length === 1 ? "clase" : "clases"}
            </h2>
            <p className="text-muted-foreground text-xs">
              Salen del planeador. Se registran al cerrarlas — no hay que crearlas antes.
            </p>
          </div>
          {pendientesPlan.map((p) => {
            const vencida =
              !p.en_receso && now > instanteClase(p.fecha, p.hora_inicio, "23:59:00") + 24 * 3600 * 1000;
            return (
              <div key={`${p.clase_id}-${p.fecha}`} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div>
                  <p className="font-medium">
                    Academia · {p.ninos} {p.ninos === 1 ? "niño" : "niños"}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {p.fecha} {p.hora_inicio.slice(0, 5)} · Profe:{" "}
                    {profName.get(p.profesor_id) ?? "—"}
                    {p.cancha ? ` · Cancha ${p.cancha}` : ""}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {p.en_receso && <Badge variant="outline">Semana de receso</Badge>}
                    {vencida && <Badge variant="destructive">+24 h sin cerrar</Badge>}
                  </div>
                </div>
                <form action={abrirClaseDelPlaneador}>
                  <input type="hidden" name="claseSemanal" value={p.clase_id} />
                  <input type="hidden" name="fecha" value={p.fecha} />
                  <button type="submit" className={buttonVariants({ size: "sm" })}>Cerrar</button>
                </form>
              </div>
            );
          })}
        </div>
      )}

      <div className="space-y-2">
        {lista.map((c) => {
          const vencida = now > instanteClase(c.fecha, c.hora_inicio, "23:59:00") + 24 * 3600 * 1000;
          const quien =
            c.tipo === "academia"
              ? `Academia: ${c.academia_id ? acaName.get(c.academia_id) ?? "—" : "—"}`
              : deportista(c) ?? "Sin deportista";
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
