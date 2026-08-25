import Link from "next/link";
import { TriangleAlert, CircleAlert, Clock } from "lucide-react";
import { DIA_CORTO, hhmm, pctAsistencia, riesgoFranja, type Riesgo } from "../ocupacion";

export type FilaTablero = {
  grupoId: number | null;
  grupoNombre: string;
  franjaId: number | null;
  dia: number | null;
  horaInicio: string | null;
  horaFin: string | null;
  profesor: string | null;
  inscritos: number;
  clases: number;
  clasesSinCerrar: number;
  clasesPorVenir: number;
  desdeEfectivo: string | null;
  presentes: number;
  ausentes: number;
  excusas: number;
};

const ICONO = {
  no_dictada: CircleAlert,
  se_vacia: TriangleAlert,
  sin_cerrar: Clock,
} as const;

const TONO = {
  no_dictada: "border-destructive/30 bg-destructive/5 text-destructive",
  se_vacia: "border-warning/40 bg-warning/10 text-[#6d4700]",
  sin_cerrar: "border-border bg-muted text-muted-foreground",
} as const;

function ChipRiesgo({ r }: { r: NonNullable<Riesgo> }) {
  const Icono = ICONO[r.tipo];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-4xl border px-2.5 py-0.5 text-[11px] ${TONO[r.tipo]}`}>
      <Icono className="size-3 shrink-0" />
      {r.texto}
    </span>
  );
}

function BarraAsistencia({ pct }: { pct: number }) {
  const col = pct >= 75 ? "bg-lime" : pct >= 60 ? "bg-warning" : "bg-destructive";
  return (
    <span className="flex items-center gap-2">
      <span className="bg-muted h-1.5 w-16 overflow-hidden rounded-full">
        <span className={`block h-1.5 rounded-full ${col}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </span>
      <span className="text-muted-foreground w-8 shrink-0 text-xs tabular-nums">{pct}%</span>
    </span>
  );
}

/**
 * Cómo se comportó cada franja EN EL PERIODO. Es una pregunta distinta de la que
 * contestan las tarjetas de grupo (esas dicen "¿dónde hay campo?", o sea cupo).
 * Aquí se ve lo que ya ocurrió: cuántas clases se dieron y cuánta gente llegó.
 */
export function TableroPeriodo({
  academiaId,
  filas,
  desde,
  hasta,
  hoy,
}: {
  academiaId: number;
  filas: FilaTablero[];
  desde: string;
  hasta: string;
  hoy: string;
}) {
  // Si NO se registró ni una clase en todo el periodo, marcar 60 franjas como
  // "no se dictó" es cierto pero apunta al sitio equivocado: el problema no está
  // en 60 franjas, está en que nadie registró los bloqueos como clases.
  const totalClases = filas.reduce((n, f) => n + f.clases + f.clasesSinCerrar + f.clasesPorVenir, 0);

  const riesgoDe = (f: FilaTablero): Riesgo => (totalClases === 0 ? null : riesgoFranja(f, desde, hasta, hoy));
  const conRiesgo = filas.map((f) => riesgoDe(f)).filter(Boolean);

  // Se listan primero las franjas con algo que mirar; el resto va después, y las
  // que ni tocaban ni tienen inscritos no aportan nada y no se pintan.
  const orden = [...filas].sort((a, b) => {
    const ra = riesgoDe(a) ? 0 : 1;
    const rb = riesgoDe(b) ? 0 : 1;
    if (ra !== rb) return ra - rb;
    return (
      a.grupoNombre.localeCompare(b.grupoNombre, "es") ||
      (a.dia ?? 9) - (b.dia ?? 9) ||
      (a.horaInicio ?? "").localeCompare(b.horaInicio ?? "")
    );
  });
  const visibles = orden.filter(
    (f) => f.inscritos > 0 || f.clases > 0 || f.clasesSinCerrar > 0 || f.clasesPorVenir > 0,
  );

  if (visibles.length === 0) {
    return (
      <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm">
        En este periodo no hay clases dictadas ni franjas con inscritos.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {totalClases === 0 ? (
        <p className="border-warning/35 bg-warning/10 flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm text-[#6d4700]">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>
            <strong>En este periodo no se registró ninguna clase de academia.</strong> Las clases nacen
            del bloqueo de EasyCancha: se registran desde el calendario de{" "}
            <Link href="/clases" className="underline">Clases</Link>, escogiendo academia y grupo.
            Hasta que eso pase, aquí no hay asistencia que medir.
          </span>
        </p>
      ) : conRiesgo.length > 0 ? (
        <p className="border-warning/35 bg-warning/10 flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm text-[#6d4700]">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>
            <strong>
              {conRiesgo.length === 1 ? "Una franja necesita" : `${conRiesgo.length} franjas necesitan`} revisión
            </strong>{" "}
            en este periodo. Van de primeras en la lista.
          </span>
        </p>
      ) : null}

      <div className="ring-foreground/[0.06] bg-card overflow-hidden rounded-xl shadow-sm ring-1">
        <div className="text-muted-foreground hidden gap-4 border-b px-4 py-2 text-[11px] uppercase md:flex">
          <span className="w-32 shrink-0">Grupo</span>
          <span className="w-32 shrink-0">Franja</span>
          <span className="min-w-0 flex-grow">Profesor</span>
          <span className="w-16 shrink-0 text-right">Niños</span>
          <span className="w-16 shrink-0 text-right">Clases</span>
          <span className="w-28 shrink-0">Asistencia</span>
        </div>
        <ul className="divide-y">
          {visibles.map((f) => {
            const r = riesgoDe(f);
            const pct = pctAsistencia(f.presentes, f.ausentes);
            return (
              <li key={`${f.grupoId}-${f.franjaId ?? "otras"}`} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2.5 text-sm">
                <span className="w-32 shrink-0 font-medium">
                  {f.grupoId ? (
                    <Link href={`/academias/${academiaId}/grupos/${f.grupoId}`} className="hover:underline">
                      {f.grupoNombre}
                    </Link>
                  ) : (
                    f.grupoNombre
                  )}
                </span>
                <span className="font-heading w-32 shrink-0 text-sm font-semibold tabular-nums">
                  {f.dia == null ? (
                    <span className="text-muted-foreground font-sans text-xs font-normal">Otras horas</span>
                  ) : (
                    `${DIA_CORTO[f.dia]} ${hhmm(f.horaInicio)}–${hhmm(f.horaFin)}`
                  )}
                </span>
                <span className="text-muted-foreground min-w-0 flex-grow truncate text-xs">
                  {f.profesor ?? (f.dia == null ? "—" : "sin profesor")}
                </span>
                <span className="w-16 shrink-0 text-right tabular-nums">{f.inscritos || "—"}</span>
                <span className="w-16 shrink-0 text-right tabular-nums">
                  {f.clases}
                  {f.clasesPorVenir > 0 && (
                    <span className="text-muted-foreground text-[11px]"> +{f.clasesPorVenir}</span>
                  )}
                </span>
                <span className="w-28 shrink-0">
                  {pct != null ? <BarraAsistencia pct={pct} /> : <span className="text-muted-foreground text-xs">—</span>}
                </span>
                {r && (
                  <span className="w-full pl-0 md:pl-36">
                    <ChipRiesgo r={r} />
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <p className="text-muted-foreground text-xs">
        <strong>Clases</strong> son las que de verdad se dictaron y se cerraron en el periodo.{" "}
        <strong>Asistencia</strong> es presentes ÷ lo registrado (presentes + faltas); las excusas
        médicas no cuentan, porque no se cobran ni son desenganche.{" "}
        El <strong>+N</strong> son clases ya registradas que todavía no ocurren.{" "}
        <strong>“Otras horas”</strong> son clases del grupo a una hora que ninguna de sus franjas
        cubre: una reposición, una clase extra o una franja mal configurada.
      </p>
    </div>
  );
}
