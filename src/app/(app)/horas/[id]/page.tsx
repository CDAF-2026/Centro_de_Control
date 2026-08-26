import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ChevronLeft } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { rangoNomina } from "@/lib/periodo";
import { diaCorto, diaIso, hhmm, horaCorta, rangoDias } from "@/lib/fecha";
import { ROLE_LABEL } from "@/lib/roles";
import {
  COLUMNAS,
  EXTRA_SEMANA_MAX_MIN,
  SEMANA_MIN,
  SIN_ALMUERZO_DESDE_MIN,
  hm,
  minutosExtra,
  porSemana,
  sumar,
  valorColumna,
} from "@/lib/turnos";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { AgregarTurno, CorregirTurno } from "../corregir-turno";
import { FotoTurno } from "../foto-turno";
import type { TurnoHoras, TurnoListado } from "@/lib/database.types";

/** Las fotos viven en un bucket privado: se sirven con enlace firmado, no público. */
const FIRMA_SEGUNDOS = 60 * 60;

export default async function HorasDeUnaPersonaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ periodo?: string; ym?: string }>;
}) {
  await requireRole(rolesForModule("turnos_reporte"));
  const { id } = await params;
  const sp = await searchParams;

  const periodo = sp.periodo === "q1" || sp.periodo === "q2" ? sp.periodo : "mes";
  const hoy = new Date();
  const ym = /^\d{4}-\d{2}$/.test(sp.ym ?? "")
    ? sp.ym!
    : `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
  const { desde, hasta } = rangoNomina(periodo, ym);

  const supabase = await createClient();
  const { data: persona } = await supabase
    .from("profiles")
    .select("id, nombre, role, marca_turno")
    .eq("id", id)
    .maybeSingle();
  if (!persona) notFound();

  const [horasRes, turnosRes] = await Promise.all([
    supabase.rpc("turnos_horas", { p_desde: desde, p_hasta: hasta, p_perfil: id }),
    supabase.rpc("turnos_listar", { p_desde: desde, p_hasta: hasta, p_perfil: id }),
  ]);
  const horas: TurnoHoras[] = horasRes.data ?? [];
  const turnos: TurnoListado[] = turnosRes.data ?? [];

  const totales = sumar(horas);
  const semanas = porSemana(horas);

  // Un solo enlace firmado por foto, en una sola llamada.
  const rutas = turnos
    .flatMap((t) => [t.foto_inicio_path, t.foto_fin_path])
    .filter((r): r is string => !!r);
  const firmadas = new Map<string, string>();
  if (rutas.length) {
    const { data } = await supabase.storage.from("turnos").createSignedUrls(rutas, FIRMA_SEGUNDOS);
    for (const f of data ?? []) {
      if (f.path && f.signedUrl) firmadas.set(f.path, f.signedUrl);
    }
  }

  // El almuerzo de cada turno, para poder editarlo sin volver a consultarlo.
  const pausas = new Map<number, { inicio: string; fin: string | null }>();
  if (turnos.length) {
    const { data } = await supabase
      .from("turno_pausa")
      .select("turno_id, inicio_el, fin_el")
      .in("turno_id", turnos.map((t) => t.id));
    for (const p of data ?? []) {
      if (!pausas.has(p.turno_id)) pausas.set(p.turno_id, { inicio: p.inicio_el, fin: p.fin_el });
    }
  }

  const nombre = persona.nombre ?? "—";
  const qs = `?periodo=${periodo}&ym=${ym}`;
  const rotuloPeriodo =
    periodo === "q1" ? "quincena 1 (1–15)" : periodo === "q2" ? "quincena 2 (16–fin)" : "mes completo";

  return (
    <div className="space-y-6">
      <Link
        href={`/horas${qs}`}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-[13px] font-semibold transition-colors"
      >
        <ChevronLeft className="size-3.5" />
        Horas del personal
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="cdaf-headline">{nombre}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {ROLE_LABEL[persona.role]} · {ym} · {rotuloPeriodo} · {turnos.length} turno
            {turnos.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="text-right">
          <p className="font-heading text-4xl leading-none font-extrabold tracking-tight tabular-nums">
            {Math.floor(totales.total / 60)}
            <span className="text-muted-foreground text-xl font-bold"> h </span>
            {String(totales.total % 60).padStart(2, "0")}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">trabajadas en el periodo</p>
        </div>
      </div>

      {totales.total === 0 && turnos.length === 0 ? (
        <EmptyState
          title="Sin turnos en este periodo"
          description="No marcó entrada ningún día del rango seleccionado."
        />
      ) : (
        <>
          {/* Composición: cuánto de lo trabajado lleva recargo */}
          <div className="bg-card ring-foreground/[0.06] rounded-xl p-5 shadow-sm ring-1">
            <div className="flex h-2.5 overflow-hidden rounded-full">
              {COLUMNAS.map((c) => {
                const v = valorColumna(totales, c);
                if (v === 0) return null;
                return (
                  <div
                    key={c.rotulo}
                    style={{ flexGrow: v, backgroundColor: c.color }}
                    title={`${c.rotulo}: ${hm(v)}`}
                  />
                );
              })}
            </div>
            <div className="mt-3.5 flex flex-wrap gap-x-6 gap-y-2">
              {COLUMNAS.map((c) => {
                const v = valorColumna(totales, c);
                return (
                  <span
                    key={c.rotulo}
                    className={cn("flex items-center gap-2 text-[13px]", v === 0 && "opacity-40")}
                  >
                    <span
                      className="size-2.5 rounded-[3px]"
                      style={{ backgroundColor: c.color }}
                    />
                    {c.rotulo}{" "}
                    <strong className="font-bold tabular-nums">{hm(v)}</strong>
                  </span>
                );
              })}
            </div>
          </div>

          {/* ⚠️ El tope de 42 h es SEMANAL y la nómina es quincenal: no cuadran.
              Partir el periodo en semanas es la única forma de ver si se pasó. */}
          <div>
            <div className="flex flex-wrap items-baseline gap-2.5 px-0.5 pb-2.5">
              <span className="cdaf-eyebrow text-muted-foreground text-[11px]">Semana a semana</span>
              <span className="text-muted-foreground text-xs">
                el tope de 42 h es semanal, no quincenal
              </span>
            </div>
            <div className="space-y-2.5">
              {semanas.map(({ semana, totales: t }) => {
                const extra = minutosExtra(t);
                const ordinarias = t.total - extra;
                const sobreTope = extra > EXTRA_SEMANA_MAX_MIN;
                return (
                  <div
                    key={semana}
                    className="bg-card ring-foreground/[0.06] flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl p-4 shadow-sm ring-1"
                  >
                    <span className="w-44 shrink-0 text-sm font-semibold">
                      {rangoDias(semana, masDias(semana, 6))}
                    </span>
                    <span className="bg-muted flex h-2 min-w-32 flex-1 overflow-hidden rounded-full">
                      <span
                        className="bg-primary"
                        style={{ flexGrow: Math.min(ordinarias, SEMANA_MIN) }}
                      />
                      {extra > 0 && <span className="bg-warning" style={{ flexGrow: extra }} />}
                      <span style={{ flexGrow: Math.max(0, SEMANA_MIN - ordinarias) }} />
                    </span>
                    <span className="font-heading w-16 shrink-0 text-right text-[15px] font-bold tabular-nums">
                      {hm(t.total)}
                    </span>
                    <span className="text-muted-foreground w-56 shrink-0 text-right text-[12.5px]">
                      {hm(ordinarias)} ordinarias
                      {extra > 0 && (
                        <>
                          {" + "}
                          <strong className="font-semibold text-[#8a5600]">{hm(extra)} extra</strong>
                        </>
                      )}
                    </span>
                    {sobreTope && (
                      <Badge variant="warning" className="shrink-0 gap-1">
                        <AlertTriangle className="size-3" />
                        Tope legal: {hm(EXTRA_SEMANA_MAX_MIN)}
                      </Badge>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Turno por turno, con la foto: la prueba de quién marcó y cuándo */}
          <div>
            <p className="cdaf-eyebrow text-muted-foreground px-0.5 pb-2.5 text-[11px]">Turnos</p>
            <div className="cdaf-table-wrap">
              <table className="cdaf-table">
                <thead>
                  <tr>
                    <th className="px-4 py-2">Día</th>
                    <th className="px-4 py-2">Entrada y salida</th>
                    <th className="px-4 py-2">Almuerzo</th>
                    <th className="px-4 py-2 text-right">Trabajadas</th>
                    <th className="px-4 py-2">Fotos</th>
                    <th className="px-4 py-2">Cómo marcó</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {turnos.map((t) => {
                    const sinCerrar = t.fin_el === null;
                    const sinAlmuerzo =
                      t.minutos !== null && t.minutos > SIN_ALMUERZO_DESDE_MIN && t.n_pausas === 0;
                    const p = pausas.get(t.id);
                    return (
                      <tr
                        key={t.id}
                        className={cn(
                          sinCerrar && "bg-destructive/[0.04]",
                          !sinCerrar && sinAlmuerzo && "bg-warning/[0.05]",
                        )}
                      >
                        <td className="px-4 py-2.5 font-medium">{diaCorto(t.dia)}</td>
                        <td className="text-muted-foreground px-4 py-2.5 tabular-nums">
                          {horaCorta(t.inicio_el)} –{" "}
                          {sinCerrar ? (
                            <span className="text-destructive font-semibold">sin marcar</span>
                          ) : (
                            horaCorta(t.fin_el!)
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          {t.n_pausas > 0 ? (
                            <span className="text-muted-foreground tabular-nums">
                              {hm(t.minutos_pausa)}
                            </span>
                          ) : sinAlmuerzo ? (
                            <Badge variant="warning">sin almuerzo</Badge>
                          ) : (
                            <span className="text-muted-foreground/45">—</span>
                          )}
                        </td>
                        <td className="font-heading px-4 py-2.5 text-right font-bold tabular-nums">
                          {t.minutos === null ? (
                            <span className="text-muted-foreground/45 font-normal">—</span>
                          ) : (
                            hm(t.minutos)
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          {t.origen === "ajuste" ? (
                            <span className="text-muted-foreground/45 text-[13px]">sin foto</span>
                          ) : (
                            <span className="flex gap-1.5">
                              <FotoTurno
                                url={t.foto_inicio_path ? firmadas.get(t.foto_inicio_path) : null}
                                momento="Entrada"
                                dia={diaCorto(t.dia)}
                                hora={horaCorta(t.inicio_el)}
                                nombre={nombre}
                              />
                              <FotoTurno
                                url={t.foto_fin_path ? firmadas.get(t.foto_fin_path) : null}
                                momento="Salida"
                                dia={diaCorto(t.dia)}
                                hora={t.fin_el ? horaCorta(t.fin_el) : null}
                                nombre={nombre}
                              />
                            </span>
                          )}
                        </td>
                        {/* ⚠️ NO es el aparato: la base no lo guarda. Es por cuál
                            PUERTA entró la marcación — con su propio usuario (desde
                            donde sea), por el quiósco con PIN, o escrita a mano. */}
                        <td className="px-4 py-2.5 text-[13px]">
                          {t.origen === "quiosco" && (
                            <span className="text-muted-foreground">Quiósco de recepción</span>
                          )}
                          {t.origen === "app" && (
                            <span className="text-muted-foreground">Con su usuario</span>
                          )}
                          {t.origen === "ajuste" && (
                            <Badge variant="outline">corregido a mano</Badge>
                          )}
                          {t.ajuste_motivo && (
                            <span className="text-muted-foreground mt-0.5 block text-xs">
                              «{t.ajuste_motivo}»
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <CorregirTurno
                            turnoId={t.id}
                            nombre={nombre}
                            fecha={t.dia}
                            fechaRotulo={diaCorto(t.dia)}
                            entrada={hhmm(t.inicio_el)}
                            salida={t.fin_el ? hhmm(t.fin_el) : ""}
                            almDesde={p ? hhmm(p.inicio) : ""}
                            almHasta={p?.fin ? hhmm(p.fin) : ""}
                            fotoInicio={{
                              url: t.foto_inicio_path
                                ? (firmadas.get(t.foto_inicio_path) ?? null)
                                : null,
                              hora: horaCorta(t.inicio_el),
                            }}
                            fotoFin={{
                              url: t.foto_fin_path ? (firmadas.get(t.foto_fin_path) ?? null) : null,
                              hora: t.fin_el ? horaCorta(t.fin_el) : null,
                            }}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <AgregarTurno perfilId={persona.id} nombre={nombre} fecha={diaIso(new Date().toISOString())} />
        <span className="text-muted-foreground text-xs">
          «Cómo marcó» es la puerta, no el aparato: con su usuario puede ser desde el celular o
          desde un computador. Las fotos se borran al mes; el registro del turno se conserva
          siempre.
        </span>
      </div>
    </div>
  );
}

/** Suma días a una fecha simple sin pasar por zonas horarias. */
function masDias(fecha: string, n: number): string {
  const [y, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
