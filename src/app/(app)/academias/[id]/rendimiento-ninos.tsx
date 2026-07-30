import { Badge } from "@/components/ui/badge";

export type NinoRendimiento = {
  miembro_id: number;
  nombre: string;
  nivel: string | null;
  horarios: number;
  esperadas: number;
  presentes: number;
  ausentes: number;
  excusas: number;
  reposiciones: number;
};

/**
 * Diagnóstico de un niño. Las excusas médicas NO cuentan como falta: no se cobran
 * y no son desenganche. Se mide sobre las clases que de verdad se dictaron en sus
 * franjas — si el club no dictó, eso sale en el tablero por franja, no aquí.
 */
function diagnostico(n: NinoRendimiento): { texto: string; tono: "success" | "warning" | "destructive" | "secondary" } | null {
  const base = n.esperadas - n.excusas;
  if (n.esperadas === 0) return { texto: "Sin clases dictadas aún", tono: "secondary" };
  if (n.presentes > n.esperadas) return { texto: "Viene de más", tono: "warning" };
  if (base <= 0) return { texto: "Todo con excusa", tono: "secondary" };
  const pct = n.presentes / base;
  if (pct < 0.5) return { texto: "Se está desenganchando", tono: "destructive" };
  if (pct < 0.75) return { texto: "Asistencia baja", tono: "warning" };
  return { texto: "Al día", tono: "success" };
}

export function RendimientoNinos({ ninos }: { ninos: NinoRendimiento[] }) {
  if (ninos.length === 0) {
    return <p className="text-muted-foreground text-sm">Sin inscritos todavía.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] text-sm">
        <thead className="text-muted-foreground border-b text-xs">
          <tr>
            <th className="py-2 text-left font-medium">Niño</th>
            <th className="py-2 text-left font-medium">Nivel</th>
            <th className="py-2 text-right font-medium">Viene</th>
            <th className="py-2 text-right font-medium">Se dictaron</th>
            <th className="py-2 text-right font-medium">Vino</th>
            <th className="py-2 text-right font-medium">Faltó</th>
            <th className="py-2 text-right font-medium">Excusas</th>
            <th className="py-2 text-right font-medium">%</th>
            <th className="py-2 text-left font-medium">&nbsp;</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {ninos.map((n) => {
            const dg = diagnostico(n);
            const base = n.esperadas - n.excusas;
            const pct = base > 0 ? Math.round((n.presentes / base) * 100) : null;
            return (
              <tr key={n.miembro_id}>
                <td className="py-2">{n.nombre}</td>
                <td className="text-muted-foreground py-2">{n.nivel ?? "—"}</td>
                <td className="py-2 text-right tabular-nums">{n.horarios}×sem</td>
                <td className="py-2 text-right tabular-nums">{n.esperadas}</td>
                <td className="py-2 text-right tabular-nums">
                  {n.presentes}
                  {n.reposiciones > 0 && (
                    <span className="text-muted-foreground"> +{n.reposiciones} rep.</span>
                  )}
                </td>
                <td className="py-2 text-right tabular-nums">{n.ausentes || "—"}</td>
                <td className="py-2 text-right tabular-nums">{n.excusas || "—"}</td>
                <td className="py-2 text-right tabular-nums">{pct !== null ? `${pct}%` : "—"}</td>
                <td className="py-2 pl-3">{dg && <Badge variant={dg.tono}>{dg.texto}</Badge>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-muted-foreground mt-3 text-xs">
        <strong>Se dictaron</strong> son las clases que de verdad se dieron en las franjas de ese niño,
        no las semanas del calendario: no se le puede reprochar faltar a una clase que nunca se dio.
        El <strong>%</strong> descuenta las excusas médicas, que no se cobran ni son desenganche.
      </p>
    </div>
  );
}
