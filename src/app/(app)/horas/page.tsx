import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { rangoNomina } from "@/lib/periodo";
import { diaCorto, rangoDias } from "@/lib/fecha";
import { ROLE_LABEL } from "@/lib/roles";
import {
  COLUMNAS,
  EXTRA_SEMANA_MAX_MIN,
  hm,
  minutosExtra,
  porPerfil,
  revisar,
  semanasSobreTope,
  sumar,
  valorColumna,
} from "@/lib/turnos";
import { Label } from "@/components/ui/label";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import type { TurnoHoras, TurnoListado } from "@/lib/database.types";

const SELECT = "border-input bg-background h-9 rounded-md border px-3 text-sm";

/**
 * "Horas del personal" — el reporte del superadministrador.
 *
 * Solo lo ve él (decisión de Laura): el empleado marca y no ve su acumulado.
 *
 * 💡 No hay total general. Sumar las horas de las cuatro personas da un número
 * que nadie usa —no se le paga a nadie "el total del club"— e invita a comparar
 * cifras que no son comparables. El total que importa es el de CADA persona, que
 * es el que se contrasta con sus 42 horas semanales (decisión de Laura, ago-2026).
 */
export default async function HorasPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; ym?: string }>;
}) {
  await requireRole(rolesForModule("turnos_reporte"));
  const sp = await searchParams;

  const periodo = sp.periodo === "q1" || sp.periodo === "q2" ? sp.periodo : "mes";
  const hoy = new Date();
  const ym = /^\d{4}-\d{2}$/.test(sp.ym ?? "")
    ? sp.ym!
    : `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
  const { desde, hasta } = rangoNomina(periodo, ym);

  const supabase = await createClient();
  const [horasRes, turnosRes, gente] = await Promise.all([
    supabase.rpc("turnos_horas", { p_desde: desde, p_hasta: hasta }),
    supabase.rpc("turnos_listar", { p_desde: desde, p_hasta: hasta }),
    // Se lee `profiles` directo, que normalmente no se hace (los selectores del
    // staff van por `staff_directorio`). Aquí es legítimo: la pantalla es
    // solo-SA, igual que /empleados, y hace falta `marca_turno`, que el RPC no
    // devuelve. Se listan TODOS los que marcan, incluso sin turnos: que alguien
    // aparezca en cero es información, no un hueco.
    supabase.from("profiles").select("id, nombre, role").eq("marca_turno", true),
  ]);

  const horas: TurnoHoras[] = horasRes.data ?? [];
  const turnos: TurnoListado[] = turnosRes.data ?? [];
  const personas = (gente.data ?? []).sort((a, b) =>
    (a.nombre ?? "").localeCompare(b.nombre ?? ""),
  );

  const nombre = new Map(personas.map((p) => [p.id, p.nombre ?? "—"]));
  const horasDe = porPerfil(horas);
  const turnosDe = new Map<string, TurnoListado[]>();
  for (const t of turnos) {
    const l = turnosDe.get(t.perfil_id);
    if (l) l.push(t);
    else turnosDe.set(t.perfil_id, [t]);
  }

  const pendiente = revisar(turnos);
  const sobreTope = semanasSobreTope(horas);
  const hayAvisos =
    pendiente.sinCerrar.length + pendiente.sinAlmuerzo.length + sobreTope.length > 0;

  const filas = personas.map((p) => {
    const totales = sumar(horasDe.get(p.id) ?? []);
    return {
      id: p.id,
      nombre: p.nombre ?? "—",
      rol: ROLE_LABEL[p.role],
      turnos: (turnosDe.get(p.id) ?? []).length,
      totales,
      extra: minutosExtra(totales),
    };
  });

  const qs = `?periodo=${periodo}&ym=${ym}`;
  const quien = (id: string) => nombre.get(id) ?? "—";

  return (
    <div className="space-y-6">
      <h1 className="cdaf-headline">Horas del personal</h1>

      <form className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="periodo">Periodo</Label>
          <select id="periodo" name="periodo" defaultValue={periodo} className={SELECT}>
            <option value="mes">Mes completo</option>
            <option value="q1">Quincena 1 (1–15)</option>
            <option value="q2">Quincena 2 (16–fin)</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ym">Mes</Label>
          <input id="ym" name="ym" type="month" defaultValue={ym} className={SELECT} />
        </div>
        <button type="submit" className={buttonVariants()}>
          Calcular
        </button>
      </form>

      {hayAvisos && (
        <div className="bg-card ring-warning/35 rounded-xl p-5 shadow-sm ring-1">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="size-[17px] text-[#8a5600]" />
            <span className="font-heading text-sm font-bold">Por revisar</span>
          </div>
          <ul className="mt-3 space-y-2 text-sm">
            {pendiente.sinCerrar.map((t) => (
              <li key={`sc-${t.id}`} className="flex items-center gap-2.5">
                <span className="bg-destructive size-1.5 shrink-0 rounded-full" />
                <span>
                  <strong>{quien(t.perfil_id)}</strong> no cerró el turno del{" "}
                  {diaCorto(t.dia)}. No suma horas hasta que lo corrijas.
                </span>
                <Link
                  href={`/horas/${t.perfil_id}${qs}`}
                  className="ml-auto shrink-0 text-[13px] font-semibold"
                >
                  Ver
                </Link>
              </li>
            ))}
            {sobreTope.map((s) => (
              <li key={`st-${s.perfilId}-${s.semana}`} className="flex items-center gap-2.5">
                <span className="bg-warning size-1.5 shrink-0 rounded-full" />
                <span>
                  <strong>{quien(s.perfilId)}</strong> pasó el tope legal de extras en la
                  semana del {rangoDias(s.semana, sumaDias(s.semana, 6))}: hizo{" "}
                  {hm(s.extra)} y el tope legal es {hm(EXTRA_SEMANA_MAX_MIN)}.
                </span>
                <Link
                  href={`/horas/${s.perfilId}${qs}`}
                  className="ml-auto shrink-0 text-[13px] font-semibold"
                >
                  Ver
                </Link>
              </li>
            ))}
            {pendiente.sinAlmuerzo.map((t) => (
              <li key={`sa-${t.id}`} className="flex items-center gap-2.5">
                <span className="bg-warning size-1.5 shrink-0 rounded-full" />
                <span>
                  <strong>{quien(t.perfil_id)}</strong> trabajó {hm(t.minutos ?? 0)} seguidas
                  el {diaCorto(t.dia)} sin marcar almuerzo. Se le está pagando la hora de
                  comida.
                </span>
                <Link
                  href={`/horas/${t.perfil_id}${qs}`}
                  className="ml-auto shrink-0 text-[13px] font-semibold"
                >
                  Ver
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {filas.length === 0 ? (
        <EmptyState
          title="Nadie registra turnos todavía"
          description="El interruptor se prende en la ficha de cada empleado."
        />
      ) : (
        <div className="cdaf-table-wrap">
          <table className="cdaf-table">
            <thead>
              <tr>
                <th className="px-4 py-2">Empleado</th>
                {COLUMNAS.map((c) => (
                  <th key={c.rotulo} className="px-4 py-2 text-right">
                    {c.rotulo}
                    {c.recargo && (
                      <span className="text-muted-foreground block text-[10px] font-normal normal-case">
                        {c.recargo}
                      </span>
                    )}
                  </th>
                ))}
                <th className="bg-primary/10 px-4 py-2 text-right">Total</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id} className={f.extra > 0 ? "bg-warning/[0.05]" : undefined}>
                  <td className="px-4 py-2.5">
                    <span className="font-medium">{f.nombre}</span>
                    <span className="text-muted-foreground block text-xs">
                      {f.rol} · {f.turnos} turno{f.turnos === 1 ? "" : "s"}
                    </span>
                  </td>
                  {COLUMNAS.map((c) => {
                    const v = valorColumna(f.totales, c);
                    return (
                      <td
                        key={c.rotulo}
                        className={cn(
                          "px-4 py-2.5 text-right tabular-nums",
                          v === 0 && "text-muted-foreground/45",
                          v > 0 && c.esExtra && "font-semibold text-[#8a5600]",
                        )}
                      >
                        {v === 0 ? "—" : hm(v)}
                      </td>
                    );
                  })}
                  <td className="bg-primary/10 font-heading px-4 py-2.5 text-right font-bold tabular-nums">
                    {hm(f.totales.total)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Link href={`/horas/${f.id}${qs}`} className="text-[13px] font-semibold">
                      Detalle
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-muted-foreground text-xs leading-relaxed">
        Horas en h:mm. Nocturnas desde las 7 p. m. · extras al pasar de 7 h en el día, de 42
        en la semana o después de las 9 p. m. · domingos y los 18 festivos llevan recargo
        dominical, que se suma al nocturno si aplica. Un turno sin cerrar aporta cero horas.
      </p>
    </div>
  );
}

/** Suma días a una fecha simple sin pasar por zonas horarias. */
function sumaDias(fecha: string, n: number): string {
  const [y, m, d] = fecha.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}
