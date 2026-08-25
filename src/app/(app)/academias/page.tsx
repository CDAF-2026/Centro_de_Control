import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { rolesForModule, can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { rangoPeriodo } from "@/lib/periodo";
import { tonoOcupacion, riesgoFranja } from "./ocupacion";

const PUNTO: Record<string, string> = {
  ok: "bg-lime",
  casi: "bg-warning",
  sobre: "bg-destructive",
  vacio: "bg-muted-foreground/40",
};

export default async function AcademiasPage() {
  const profile = await requireRole(rolesForModule("academias"));
  const supabase = await createClient();

  // Una sola llamada para TODOS los grupos: el resumen se agrega en SQL para no
  // pedir las franjas academia por academia (regla de las 1.000 filas + N+1).
  // El listado no lleva selector de periodo: el periodo se escoge DENTRO de cada
  // academia (se llega haciéndole clic, y son 4). Aquí solo hace falta saber a
  // cuál entrar, así que se mira el mes en curso.
  const { curStartIso, curEndIso, todayIso } = rangoPeriodo("mes", new Date());
  const [{ data: academias }, { data: grupos }, { data: ocupacion }] = await Promise.all([
    supabase.from("academias").select("id, codigo, nombre, deporte, categoria, activa").order("codigo"),
    supabase.rpc("academia_grupos_resumen", { p_academia: null }),
    supabase.rpc("academia_ocupacion_franja", { p_academia: null, p_desde: curStartIso, p_hasta: curEndIso }),
  ]);

  const porAcademia = new Map<number, NonNullable<typeof grupos>>();
  for (const g of grupos ?? []) {
    const lista = porAcademia.get(g.academia_id) ?? [];
    lista.push(g);
    porAcademia.set(g.academia_id, lista);
  }

  // Mismo criterio que la ficha: si en el periodo no se registró NINGUNA clase de
  // esa academia, no se cuentan 60 franjas "sin dictar" — eso es un solo problema.
  const clasesPorAcademia = new Map<number, number>();
  for (const o of ocupacion ?? [])
    clasesPorAcademia.set(
      o.academia_id,
      (clasesPorAcademia.get(o.academia_id) ?? 0) + o.clases + o.clases_sin_cerrar + o.clases_por_venir,
    );

  const riesgoPorAcademia = new Map<number, number>();
  for (const o of ocupacion ?? []) {
    if ((clasesPorAcademia.get(o.academia_id) ?? 0) === 0) continue;
    const r = riesgoFranja(
      {
        inscritos: o.inscritos,
        clases: o.clases,
        clasesSinCerrar: o.clases_sin_cerrar,
        clasesPorVenir: o.clases_por_venir,
        desdeEfectivo: o.desde_efectivo,
        presentes: o.presentes,
        ausentes: o.ausentes,
        dia: o.dia_semana,
      },
      curStartIso,
      curEndIso,
      todayIso,
    );
    if (r) riesgoPorAcademia.set(o.academia_id, (riesgoPorAcademia.get(o.academia_id) ?? 0) + 1);
  }

  const puedeEditar = can(profile.role, "academias", "edit");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="cdaf-headline">Academias</h1>
          <p className="text-muted-foreground mt-1.5 text-sm">
            Cuatro academias. Dentro de cada una, los grupos por nivel y edad.
          </p>
        </div>
        {puedeEditar && (
          <Link href="/academias/nueva" className={buttonVariants()}>+ Nueva academia</Link>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {(academias ?? []).map((a) => {
          const gs = porAcademia.get(a.id) ?? [];
          const ninos = gs.reduce((n, g) => n + g.ninos, 0);
          const cupo = gs.reduce((n, g) => n + g.cupo_total, 0);
          const ocupados = gs.reduce((n, g) => n + g.ocupados, 0);
          const sobre = gs.reduce((n, g) => n + g.franjas_sobre_cupo, 0);
          const libres = Math.max(0, cupo - ocupados);
          const revisar = riesgoPorAcademia.get(a.id) ?? 0;

          return (
            <Link
              key={a.id}
              href={`/academias/${a.id}`}
              className="hover:border-lime ring-foreground/[0.06] bg-card block rounded-xl p-5 shadow-sm ring-1 transition-all hover:-translate-y-0.5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="cdaf-title text-[17px]">{a.nombre}</p>
                  <p className="text-muted-foreground mt-0.5 font-mono text-xs">{a.codigo}</p>
                </div>
                <Badge variant={a.deporte === "tenis" ? "secondary" : "outline"}>{a.deporte}</Badge>
              </div>

              <div className="mt-4 flex gap-7 text-sm">
                <div>
                  <p className="cdaf-eyebrow text-muted-foreground text-[11px]">Grupos</p>
                  <p className="font-heading mt-0.5 text-[22px] font-bold tabular-nums">{gs.length}</p>
                </div>
                <div>
                  <p className="cdaf-eyebrow text-muted-foreground text-[11px]">Niños</p>
                  <p className="font-heading mt-0.5 text-[22px] font-bold tabular-nums">{ninos}</p>
                </div>
                <div>
                  <p className="cdaf-eyebrow text-muted-foreground text-[11px]">Cupos libres</p>
                  <p className={`font-heading mt-0.5 text-[22px] font-bold tabular-nums ${libres > 0 ? "text-[#5b6300]" : "text-muted-foreground"}`}>
                    {libres}
                  </p>
                </div>
              </div>

              {gs.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {gs.map((g) => {
                    const { tono } = tonoOcupacion(g.ocupados, g.cupo_total);
                    return (
                      <span
                        key={g.grupo_id}
                        className="border-border bg-card inline-flex h-[22px] items-center gap-1.5 rounded-4xl border px-2.5 text-[11.5px]"
                      >
                        <span className={`size-1.5 rounded-full ${PUNTO[tono]}`} />
                        {g.nombre} · <span className="tabular-nums">{g.ninos}</span>
                      </span>
                    );
                  })}
                </div>
              ) : (
                <p className="bg-muted text-muted-foreground mt-4 rounded-lg px-3 py-2 text-xs">
                  Todavía sin grupos.
                </p>
              )}

              {(sobre > 0 || revisar > 0) && (
                <p className="bg-warning/10 mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-[#6d4700]">
                  <TriangleAlert className="size-3.5 shrink-0" />
                  {[
                    sobre > 0 ? (sobre === 1 ? "1 franja sobre el cupo" : `${sobre} franjas sobre el cupo`) : null,
                    revisar > 0
                      ? revisar === 1
                        ? "1 franja por revisar este mes"
                        : `${revisar} franjas por revisar este mes`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}

              {!a.activa && <Badge variant="outline" className="mt-3">Inactiva</Badge>}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
