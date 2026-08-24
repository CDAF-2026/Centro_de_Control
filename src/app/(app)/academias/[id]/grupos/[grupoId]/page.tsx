import Link from "next/link";
import { notFound } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { rolesForModule, can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { mapaNombresStaff } from "@/lib/staff";
import { rangoPeriodo, parsePeriodo } from "@/lib/periodo";
import { PeriodoToggle } from "../../../../dashboard/periodo-toggle";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { BarraOcupacion, DIA_CORTO, NIVEL_LABEL, hhmm, tonoOcupacion } from "../../../ocupacion";

export default async function GrupoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; grupoId: string }>;
  searchParams: Promise<{ periodo?: string; desde?: string; hasta?: string }>;
}) {
  const profile = await requireRole(rolesForModule("academias"));
  const { id, grupoId } = await params;
  const academiaId = Number(id);
  const gid = Number(grupoId);
  const sp = await searchParams;
  const periodo = parsePeriodo(sp.periodo);
  const { curStartIso, curEndIso } = rangoPeriodo(periodo, new Date(), sp.desde, sp.hasta);

  const supabase = await createClient();
  const { data: g } = await supabase
    .from("academia_grupo")
    .select("id, academia_id, nombre, nivel, edad_min, edad_max")
    .eq("id", gid)
    .maybeSingle();
  if (!g || g.academia_id !== academiaId) notFound();

  const [{ data: aca }, { data: franjas }, { data: inscritos }, nombres] = await Promise.all([
    supabase.from("academias").select("nombre").eq("id", academiaId).single(),
    supabase.rpc("grupo_franjas", { p_grupo: gid }),
    supabase.rpc("grupo_inscritos", { p_grupo: gid, p_desde: curStartIso, p_hasta: curEndIso }),
    mapaNombresStaff(),
  ]);

  const fr = franjas ?? [];
  const ins = inscritos ?? [];
  const tope = fr[0]?.cupo ?? 0;
  const sobre = fr.filter((f) => f.inscritos > f.cupo);
  const fueraRango = ins.filter((i) => i.fuera_de_rango).length;
  const puedeInscribir = ["superadmin", "coord_admin", "coord_deportivo", "recepcion"].includes(profile.role);
  const puedeGestionar = can(profile.role, "academias", "edit");

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/academias/${academiaId}`} className="text-muted-foreground text-sm hover:underline">
          ← {aca?.nombre ?? "Academia"}
        </Link>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="cdaf-headline">{g.nombre}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{NIVEL_LABEL[g.nivel] ?? g.nivel}</Badge>
              <Badge variant="secondary">{g.edad_min} a {g.edad_max} años</Badge>
              {tope > 0 && (
                <span className="text-muted-foreground text-xs">Máximo {tope} niños por franja</span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <PeriodoToggle
              periodo={periodo}
              desde={sp.desde}
              hasta={sp.hasta}
              basePath={`/academias/${academiaId}/grupos/${gid}`}
            />
            {puedeGestionar && (
              <Link href={`/academias/${academiaId}/grupos/${gid}/editar`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                Editar grupo
              </Link>
            )}
            {puedeInscribir && (
              <Link href={`/academias/${academiaId}/inscribir?grupo=${gid}`} className={buttonVariants({ size: "sm" })}>
                + Inscribir niño
              </Link>
            )}
          </div>
        </div>
      </div>

      {sobre.length > 0 && (
        <p className="border-warning/35 bg-warning/10 flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm text-[#6d4700]">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>
            <strong>
              {sobre.length === 1 ? "Una franja está" : `${sobre.length} franjas están`} por encima del cupo.
            </strong>{" "}
            {sobre.map((f) => `${DIA_CORTO[f.dia_semana]} va con ${f.inscritos}`).join(", ")}, y el tope de{" "}
            {(NIVEL_LABEL[g.nivel] ?? g.nivel).toLowerCase()} es {tope}. Se puede inscribir igual — esto es
            un aviso, no un bloqueo.
          </span>
        </p>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="cdaf-title text-base">Franjas</h2>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Los horarios habilitados de este grupo. Cada niño escoge a cuáles va.
            </p>
          </div>
          {puedeGestionar && (
            <Link href={`/academias/${academiaId}/grupos/${gid}/franjas`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              + Agregar franja
            </Link>
          )}
        </div>

        {fr.length === 0 ? (
          <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm">
            Este grupo no tiene franjas. Agrégale al menos una para poder inscribir niños.
          </p>
        ) : (
          <div className="cdaf-table-wrap">
            <table className="cdaf-table">
              <thead>
                <tr>
                  <th className="px-4 py-2.5">Día y hora</th>
                  <th className="px-4 py-2.5">Profesor</th>
                  <th className="px-4 py-2.5">Cancha</th>
                  <th className="w-56 px-4 py-2.5">Ocupación</th>
                </tr>
              </thead>
              <tbody>
                {fr.map((f) => {
                  const { tono } = tonoOcupacion(f.inscritos, f.cupo);
                  return (
                    <tr key={f.franja_id}>
                      <td className="font-heading font-semibold tabular-nums">
                        {DIA_CORTO[f.dia_semana]} {hhmm(f.hora_inicio)}–{hhmm(f.hora_fin)}
                      </td>
                      <td className="text-muted-foreground">
                        {f.profesor_id ? nombres.get(f.profesor_id) ?? "—" : "sin profesor"}
                      </td>
                      <td className="text-muted-foreground">{f.cancha ?? "—"}</td>
                      <td>
                        <div className="flex items-center gap-3">
                          <BarraOcupacion ocupados={f.inscritos} cupo={f.cupo} />
                          <span className={`shrink-0 text-xs tabular-nums ${tono === "sobre" ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                            {f.inscritos} de {f.cupo}
                            {tono === "sobre" && " · sobre cupo"}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="cdaf-title text-base">Inscritos ({ins.length})</h2>

        {ins.length === 0 ? (
          <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm">
            Sin inscritos todavía.
          </p>
        ) : (
          <>
            <div className="cdaf-table-wrap">
              <table className="cdaf-table">
                <thead>
                  <tr>
                    <th className="px-4 py-2.5">Niño</th>
                    <th className="w-20 px-4 py-2.5">Edad</th>
                    <th className="px-4 py-2.5">Viene</th>
                    <th className="w-40 px-4 py-2.5">Asistencia</th>
                    <th className="px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {ins.map((i) => {
                    const base = i.esperadas - i.excusas;
                    const pct = base > 0 ? Math.round((i.presentes / base) * 100) : null;
                    const col = pct === null ? "bg-muted-foreground/30" : pct >= 75 ? "bg-lime" : pct >= 50 ? "bg-warning" : "bg-destructive";
                    return (
                      <tr key={i.inscripcion_id}>
                        <td className="font-medium">{i.nombre}</td>
                        <td className={`tabular-nums ${i.fuera_de_rango ? "font-medium text-[#8a5600]" : ""}`}>
                          {i.edad}
                        </td>
                        <td>
                          <div className="flex flex-wrap gap-1.5">
                            {i.franjas.map((d, k) => (
                              <span key={`${d}-${k}`} className="bg-muted inline-flex h-5 items-center rounded-4xl px-2 text-[11.5px] tabular-nums">
                                {DIA_CORTO[d]} {i.horas[k]}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td>
                          {pct === null ? (
                            <span className="text-muted-foreground text-xs">sin clases aún</span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <div className="bg-muted h-1.5 w-14 overflow-hidden rounded-full">
                                <div className={`h-1.5 rounded-full ${col}`} style={{ width: `${Math.min(100, pct)}%` }} />
                              </div>
                              <span className="text-muted-foreground text-xs tabular-nums">{pct}%</span>
                            </div>
                          )}
                        </td>
                        <td className="text-right">
                          <Link href={`/clientes/${i.cliente_id}`} className="text-muted-foreground text-xs hover:underline">
                            Ficha
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {fueraRango > 0 && (
              <p className="text-muted-foreground text-xs">
                La edad en ámbar queda fuera del rango del grupo ({g.edad_min} a {g.edad_max} años). No
                impide nada; es para revisarlo.
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
