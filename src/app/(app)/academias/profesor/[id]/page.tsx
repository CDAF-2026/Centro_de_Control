import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { rolesForModule, can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { docentesConDeporte, mapaNombresStaff } from "@/lib/staff";
import { buttonVariants } from "@/components/ui/button";
import { DIA_LARGO, DIAS_SEMANA, hhmm, horaFin, duracionTexto } from "../../ui";

/**
 * La semana de un profesor: su pestaña del Excel, con la ocupación bien contada.
 *
 * ⚠️ El planeador del club cuenta UNA FILA DE NIÑO como media hora de profesor,
 * así que una clase de 4 le sale como 2 horas y el martes de Graciano marcaba
 * 175% de ocupación. Aquí las horas son de CLASE y los niños se cuentan aparte.
 */
export default async function ProfesorSemanaPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireRole(rolesForModule("academias"));
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: clases }, docentes, nombres] = await Promise.all([
    supabase.rpc("planeador_semana", { p_deporte: "tenis" }),
    docentesConDeporte(),
    mapaNombresStaff(),
  ]);

  const suyas = (clases ?? []).filter((c) => c.profesor_id === id);
  const docente = docentes.find((d) => d.id === id);
  // No se exige que siga siendo docente activo: si al club le dan de baja a
  // alguien, sus clases tienen que seguir siendo alcanzables para poder
  // reasignarlas. Solo es 404 si el id no es nadie y además no dicta nada.
  if (!docente && suyas.length === 0) notFound();
  const nombre = docente?.nombre ?? nombres.get(id) ?? "Profesor";
  const ninos = suyas.reduce((n, c) => n + c.ninos, 0);
  const horas = suyas.reduce((n, c) => n + c.duracion_min, 0) / 60;
  const puedeEditar = can(profile.role, "academias", "edit");

  return (
    <div className="space-y-6">
      <div>
        <Link href="/academias" className="text-muted-foreground text-sm hover:underline">← Academias</Link>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="cdaf-headline">{nombre}</h1>
            <p className="text-muted-foreground mt-1.5 text-sm">Sus academias de la semana.</p>
          </div>
          {puedeEditar && (
            <Link href={`/academias/clase/nueva?profesor=${id}`} className={buttonVariants({ size: "sm" })}>
              + Nueva clase
            </Link>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi label="Clases a la semana" valor={suyas.length} />
        <Kpi label="Cupos ocupados" valor={ninos} />
        <Kpi label="Horas de cancha" valor={horas % 1 ? horas.toFixed(1) : String(horas)} />
      </div>

      {suyas.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border border-dashed p-8 text-center text-sm">
          Todavía no tiene ninguna clase asignada.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {DIAS_SEMANA.map((d) => {
            const delDia = suyas
              .filter((c) => c.dia_semana === d)
              .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
            if (!delDia.length) return null;
            return (
              <section key={d} className="ring-foreground/[0.06] bg-card rounded-xl p-4.5 shadow-sm ring-1">
                <div className="flex items-baseline justify-between">
                  <h2 className="cdaf-title text-base">{DIA_LARGO[d]}</h2>
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {delDia.length} {delDia.length === 1 ? "clase" : "clases"}
                  </span>
                </div>
                <ul className="mt-3 space-y-1.5">
                  {delDia.map((c) => (
                    <li key={c.clase_id}>
                      <Link
                        href={`/academias/clase/${c.clase_id}`}
                        className="hover:border-lime border-border flex items-center justify-between gap-3 rounded-lg border px-3 py-2 transition-colors"
                      >
                        <span>
                          <span className="block text-sm font-medium tabular-nums">
                            {hhmm(c.hora_inicio)}–{horaFin(c.hora_inicio, c.duracion_min)}
                          </span>
                          <span className="text-muted-foreground block text-[11px]">
                            {duracionTexto(c.duracion_min)}
                            {c.cancha && ` · Cancha ${c.cancha}`}
                          </span>
                        </span>
                        <span className="text-right">
                          <span className="font-heading block text-lg font-bold tabular-nums">{c.ninos}</span>
                          {c.competencia > 0 && (
                            <span className="text-muted-foreground block text-[10px]">{c.competencia} comp.</span>
                          )}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Kpi({ label, valor }: { label: string; valor: number | string }) {
  return (
    <div className="ring-foreground/[0.06] bg-card rounded-xl px-4.5 py-4 shadow-sm ring-1">
      <p className="cdaf-eyebrow text-muted-foreground text-[11px]">{label}</p>
      <p className="font-heading mt-1 text-[26px] font-bold tabular-nums">{valor}</p>
    </div>
  );
}
