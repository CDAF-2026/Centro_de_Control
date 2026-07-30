import { Badge } from "@/components/ui/badge";

const DIA_LABEL = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "");

export type Franja = {
  dia_semana: number | null;
  hora_inicio: string | null;
  hora_fin: string | null;
  inscritos: number;
  clases_cerradas: number;
  clases_sin_cerrar: number;
  presentes: number;
  ausentes: number;
  excusas: number;
  reposiciones: number;
};

/**
 * Diagnóstico de una franja. Son dos fracasos distintos que antes se veían
 * iguales, y solo se distinguen porque sabemos a quién se esperaba:
 *   · inscritos pero cero clases  → la clase NO se dio (operativo)
 *   · clases dadas y poca gente   → el grupo se está vaciando (negocio)
 */
function diagnostico(f: Franja): { texto: string; tono: "ok" | "warn" | "bad" | "info" } | null {
  if (f.dia_semana === null) return { texto: "Fuera de las franjas inscritas", tono: "info" };
  if (f.clases_cerradas === 0 && f.clases_sin_cerrar === 0) {
    return { texto: "No se dictó ninguna clase", tono: "bad" };
  }
  if (f.clases_cerradas === 0) return { texto: "Sin cerrar", tono: "warn" };
  const ocup = f.inscritos > 0 ? f.presentes / (f.clases_cerradas * f.inscritos) : 0;
  if (ocup < 0.5) return { texto: "Se está vaciando", tono: "bad" };
  if (ocup < 0.75) return { texto: "Asistencia baja", tono: "warn" };
  return { texto: "Sana", tono: "ok" };
}

const TONO: Record<string, "success" | "warning" | "destructive" | "secondary"> = {
  ok: "success",
  warn: "warning",
  bad: "destructive",
  info: "secondary",
};

export function RendimientoFranjas({ franjas }: { franjas: Franja[] }) {
  if (franjas.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Todavía no hay horarios inscritos. Al inscribir niños con sus días, aquí aparece una fila por
        franja con su asistencia.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[38rem] text-sm">
        <thead className="text-muted-foreground border-b text-xs">
          <tr>
            <th className="py-2 text-left font-medium">Franja</th>
            <th className="py-2 text-right font-medium">Inscritos</th>
            <th className="py-2 text-right font-medium">Clases</th>
            <th className="py-2 text-right font-medium">Asisten</th>
            <th className="py-2 text-right font-medium">Ocupación</th>
            <th className="py-2 text-left font-medium">&nbsp;</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {franjas.map((f, idx) => {
            const dg = diagnostico(f);
            const prom = f.clases_cerradas > 0 ? f.presentes / f.clases_cerradas : null;
            const ocup = prom !== null && f.inscritos > 0 ? Math.round((prom / f.inscritos) * 100) : null;
            return (
              <tr key={`${f.dia_semana}-${f.hora_inicio}-${idx}`}>
                <td className="py-2">
                  {f.dia_semana === null ? (
                    <span className="text-muted-foreground">Otras horas</span>
                  ) : (
                    <span className="tabular-nums">
                      <strong>{DIA_LABEL[f.dia_semana]}</strong> {hhmm(f.hora_inicio)}–{hhmm(f.hora_fin)}
                    </span>
                  )}
                </td>
                <td className="py-2 text-right tabular-nums">{f.inscritos || "—"}</td>
                <td className="py-2 text-right tabular-nums">
                  {f.clases_cerradas}
                  {f.clases_sin_cerrar > 0 && (
                    <span className="text-muted-foreground"> +{f.clases_sin_cerrar} s/cerrar</span>
                  )}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {prom !== null ? prom.toFixed(1).replace(".", ",") : "—"}
                </td>
                <td className="py-2 text-right tabular-nums">{ocup !== null ? `${ocup}%` : "—"}</td>
                <td className="py-2 pl-3">
                  {dg && <Badge variant={TONO[dg.tono]}>{dg.texto}</Badge>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-muted-foreground mt-3 text-xs">
        <strong>Asisten</strong> es el promedio de niños presentes por clase cerrada, y{" "}
        <strong>ocupación</strong> es ese promedio sobre los inscritos de la franja. Una franja con
        inscritos y cero clases significa que la clase no se dictó (o no se registró), que es distinto
        de que se dictó y no llegó nadie.
      </p>
    </div>
  );
}
