import { Badge } from "@/components/ui/badge";

export const DIA_CORTO = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
export const NIVEL_LABEL: Record<string, string> = {
  iniciacion: "Iniciación",
  intermedio: "Intermedio",
  avanzado: "Avanzado",
};
export const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "");

/**
 * Semáforo de ocupación. Es la columna vertebral visual del módulo: la pregunta
 * del club no es "cuántos hay" sino "dónde hay campo". Verde = con cupo ·
 * ámbar = casi lleno · rojo = por encima del tope. El cupo AVISA, nunca bloquea.
 */
export function tonoOcupacion(ocupados: number, cupo: number) {
  if (cupo <= 0) return { tono: "vacio" as const, pct: 0 };
  const pct = Math.round((ocupados / cupo) * 100);
  if (ocupados > cupo) return { tono: "sobre" as const, pct };
  if (pct >= 85) return { tono: "casi" as const, pct };
  return { tono: "ok" as const, pct };
}

const BARRA: Record<string, string> = {
  ok: "bg-lime",
  casi: "bg-warning",
  sobre: "bg-destructive",
  vacio: "bg-muted-foreground/30",
};

export function BarraOcupacion({ ocupados, cupo }: { ocupados: number; cupo: number }) {
  const { tono, pct } = tonoOcupacion(ocupados, cupo);
  return (
    <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
      <div className={`h-1.5 rounded-full ${BARRA[tono]}`} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  );
}

export function ChipOcupacion({ ocupados, cupo }: { ocupados: number; cupo: number }) {
  const { tono } = tonoOcupacion(ocupados, cupo);
  if (tono === "sobre") return <Badge variant="destructive">Sobre cupo</Badge>;
  if (tono === "casi") return <Badge variant="warning">Casi lleno</Badge>;
  if (tono === "vacio") return <Badge variant="outline">Sin franjas</Badge>;
  return <Badge variant="success">Con cupo</Badge>;
}
