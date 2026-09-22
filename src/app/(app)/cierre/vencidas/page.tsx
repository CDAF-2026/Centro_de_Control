import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { instanteClase } from "@/lib/fecha";
import { createClient } from "@/lib/supabase/server";
import { mapaNombresStaff } from "@/lib/staff";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { CalendarCheck } from "lucide-react";
import { abrirClaseDelPlaneador } from "../actions";

const pad = (n: number) => String(n).padStart(2, "0");

export default async function ClasesVencidasPage() {
  await requireRole(["superadmin"]);
  const supabase = await createClient();

  const now = new Date();
  const hoyIso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  // Clases aún programadas con fecha <= hoy; luego filtramos las que ya pasaron las 24 h.
  const { data: clases } = await supabase
    .from("clases")
    .select("id, fecha, hora_inicio, tipo, deporte, profesor_id, cliente_id, academia_id")
    .eq("estado", "programada")
    .lte("fecha", hoyIso)
    .order("fecha", { ascending: false })
    .limit(300);

  const nowMs = now.getTime();
  const vencidas = (clases ?? []).filter((c) => {
    return nowMs > instanteClase(c.fecha, c.hora_inicio, "23:59:00") + 24 * 3600 * 1000;
  });

  // Las academias no se registran de antemano, así que lo vencido de academia hay
  // que pedírselo al planeador. La cola del día a día solo mira 30 días atrás para
  // seguir siendo legible; lo más viejo vive AQUÍ, donde está quien puede cerrarlo.
  const { data: delPlan } = await supabase.rpc("academia_pendientes", {
    p_desde: "2026-01-01",   // el piso real lo pone `clase_semanal.vigente_desde`
    p_hasta: hoyIso,
    p_profesor: null,
  });
  const planVencidas = (delPlan ?? [])
    .filter((p) => !p.en_receso)
    .filter((p) => nowMs > instanteClase(p.fecha, p.hora_inicio, "23:59:00") + 24 * 3600 * 1000)
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .slice(0, 300);

  const profIds = [...new Set(
    [...vencidas.map((c) => c.profesor_id), ...planVencidas.map((p) => p.profesor_id)]
      .filter((x): x is string => !!x),
  )];
  const cliIds = [...new Set(vencidas.map((c) => c.cliente_id).filter((x): x is number => x != null))];
  const acaIds = [...new Set(vencidas.map((c) => c.academia_id).filter((x): x is number => x != null))];
  const profName = new Map<string, string>();
  if (profIds.length) {
    const nombres = await mapaNombresStaff();
    for (const id of profIds) profName.set(id, nombres.get(id) ?? "—");
  }
  const cliName = new Map<number, string>();
  if (cliIds.length) {
    const { data } = await supabase.from("clientes").select("id, nombres, apellidos").in("id", cliIds);
    for (const c of data ?? []) cliName.set(c.id, `${c.apellidos}, ${c.nombres}`);
  }
  const acaName = new Map<number, string>();
  if (acaIds.length) {
    const { data } = await supabase.from("academias").select("id, nombre").in("id", acaIds);
    for (const a of data ?? []) acaName.set(a.id, a.nombre);
  }

  const haceTexto = (c: { fecha: string; hora_inicio: string | null }) => {
    const ms = nowMs - (instanteClase(c.fecha, c.hora_inicio, "23:59:00") + 24 * 3600 * 1000);
    const dias = Math.floor(ms / 86400000);
    return dias >= 1 ? `vencida hace ${dias} día${dias === 1 ? "" : "s"}` : `vencida hace ${Math.floor(ms / 3600000)} h`;
  };

  return (
    <div className="space-y-6">
      <div>
        <Link href="/cierre" className="text-muted-foreground text-sm hover:underline">← Clases por cerrar</Link>
        <h1 className="cdaf-headline mt-1">Clases vencidas ({vencidas.length + planVencidas.length})</h1>
        <p className="text-muted-foreground text-sm">
          Clases que pasaron <strong>24 h sin cerrarse</strong> por el profesor → no entran a la liquidación.
          Ciérralas tú (como superadministrador) o reactívalas para que el profesor las registre.
        </p>
      </div>

      {vencidas.length + planVencidas.length === 0 ? (
        <EmptyState icon={CalendarCheck} title="No hay clases vencidas" description="Todo se cerró a tiempo. 🎉" />
      ) : (
        <div className="space-y-2">
          {vencidas.map((c) => {
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
                    {c.fecha} {c.hora_inicio?.slice(0, 5) ?? ""}
                    {c.deporte ? ` · ${c.deporte}` : ""} · Profe: {profe}
                  </p>
                  <Badge variant="destructive" className="mt-1">{haceTexto(c)}</Badge>
                </div>
                <Link href={`/cierre/${c.id}`} className={buttonVariants({ size: "sm" })}>Cerrar</Link>
              </div>
            );
          })}
        </div>
      )}

      {planVencidas.length > 0 && (
        <div className="space-y-2">
          <h2 className="cdaf-title text-base">
            Academias · {planVencidas.length} sin cerrar
          </h2>
          <p className="text-muted-foreground text-xs">
            Salen del planeador y no llegaron a registrarse. Las semanas de receso no se cuentan aquí.
          </p>
          {planVencidas.map((p) => (
            <div key={`${p.clase_id}-${p.fecha}`} className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div>
                <p className="font-medium">Academia · {p.ninos} {p.ninos === 1 ? "niño" : "niños"}</p>
                <p className="text-muted-foreground text-sm">
                  {p.fecha} {p.hora_inicio.slice(0, 5)} · Profe: {profName.get(p.profesor_id) ?? "—"}
                </p>
                <Badge variant="destructive" className="mt-1">{haceTexto(p)}</Badge>
              </div>
              <form action={abrirClaseDelPlaneador}>
                <input type="hidden" name="claseSemanal" value={p.clase_id} />
                <input type="hidden" name="fecha" value={p.fecha} />
                <button type="submit" className={buttonVariants({ size: "sm" })}>Cerrar</button>
              </form>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
