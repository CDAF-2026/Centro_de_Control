import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { mapaNombresStaff } from "@/lib/staff";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { CalendarCheck } from "lucide-react";

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
    const dt = new Date(`${c.fecha}T${c.hora_inicio ?? "23:59"}:00`);
    return nowMs > dt.getTime() + 24 * 3600 * 1000;
  });

  const profIds = [...new Set(vencidas.map((c) => c.profesor_id).filter((x): x is string => !!x))];
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
    const dt = new Date(`${c.fecha}T${c.hora_inicio ?? "23:59"}:00`);
    const ms = nowMs - (dt.getTime() + 24 * 3600 * 1000);
    const dias = Math.floor(ms / 86400000);
    return dias >= 1 ? `vencida hace ${dias} día${dias === 1 ? "" : "s"}` : `vencida hace ${Math.floor(ms / 3600000)} h`;
  };

  return (
    <div className="space-y-6">
      <div>
        <Link href="/cierre" className="text-muted-foreground text-sm hover:underline">← Clases por cerrar</Link>
        <h1 className="cdaf-headline mt-1">Clases vencidas ({vencidas.length})</h1>
        <p className="text-muted-foreground text-sm">
          Clases que pasaron <strong>24 h sin cerrarse</strong> por el profesor → no entran a la liquidación.
          Ciérralas tú (como superadministrador) o reactívalas para que el profesor las registre.
        </p>
      </div>

      {vencidas.length === 0 ? (
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
    </div>
  );
}
