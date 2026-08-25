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

/**
 * Cuántas veces cae ese día de la semana dentro del periodo. Es lo que hace
 * honesta la alerta de "no se dictó": si el periodo es esta semana, hoy es
 * martes y la franja es sábado, cero clases NO es un fallo — todavía no tocaba.
 */
/** El día anterior a una fecha ISO, sin salirse del calendario local. */
function diaAntes(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() - 1);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function ocurrenciasDeDia(dia: number, desdeIso: string, hastaIso: string): number {
  const d = new Date(`${desdeIso}T00:00:00`);
  const h = new Date(`${hastaIso}T00:00:00`);
  if (h < d) return 0;
  const dias = Math.floor((h.getTime() - d.getTime()) / 86400000) + 1;
  const primer = (dia - d.getDay() + 7) % 7; // días hasta la primera ocurrencia
  return primer >= dias ? 0 : Math.floor((dias - 1 - primer) / 7) + 1;
}

export type FranjaPeriodo = {
  inscritos: number;
  clases: number;
  clasesSinCerrar: number;
  clasesPorVenir: number;
  presentes: number;
  ausentes: number;
  dia: number | null;
  /** Desde cuándo se le puede exigir clase (null = la academia nunca registró ninguna). */
  desdeEfectivo: string | null;
};

/**
 * De peor a menos grave. Ordena la lista de franjas: quien entra a la ficha del
 * grupo debe encontrar arriba lo que hay que hacer y poder dejar de leer.
 */
export const ORDEN_RIESGO: Record<string, number> = { no_dictada: 0, se_vacia: 1, sin_cerrar: 2 };

/** Peso de una franja para ordenarla: primero lo que pide atención. */
export function pesoRiesgo(r: Riesgo): number {
  return r ? ORDEN_RIESGO[r.tipo] ?? 3 : 9;
}

export type Riesgo =
  | { tipo: "no_dictada"; texto: string }
  | { tipo: "se_vacia"; texto: string }
  | { tipo: "sin_cerrar"; texto: string }
  | null;

/**
 * Las dos preguntas que antes se veían iguales y que solo se pueden separar
 * ahora que se sabe a quién se esperaba:
 *   · con inscritos y CERO clases dictadas → la clase no se dio (operativo)
 *   · con clases y poca gente              → el grupo se vacía (negocio)
 * Y una tercera, que es de trámite: clases que pasaron y nadie cerró.
 */
export function riesgoFranja(f: FranjaPeriodo, desde: string, hasta: string, hoy: string): Riesgo {
  const registradas = f.clases + f.clasesSinCerrar + f.clasesPorVenir;
  // Solo se cuentan las veces que tocaba DESPUÉS de que la academia empezara a
  // registrar clases: antes de eso, la ausencia no dice nada del club.
  const arranque = f.desdeEfectivo && f.desdeEfectivo > desde ? f.desdeEfectivo : desde;
  // HOY no se reprocha: la clase de esta tarde todavía se puede registrar. Una
  // ausencia solo es ausencia a partir de mañana.
  const exigible = hasta >= hoy ? diaAntes(hoy) : hasta;
  const tocaba =
    f.dia == null || !f.desdeEfectivo ? registradas : ocurrenciasDeDia(f.dia, arranque, exigible);
  const sinRegistrar = Math.max(0, tocaba - registradas);

  // ⚠️ El `texto` es una frase COMPLETA, no un trozo para meter en otra: probado
  // envuelto en "Esta franja …" y salía "Esta franja solo el 41% de asistencia".
  // De peor a menos grave: que no exista la clase · que el grupo se vacíe · que
  // falte cerrarla. Las tres son distintas y no se pueden ver iguales.
  if (f.inscritos > 0 && sinRegistrar > 0) {
    return {
      tipo: "no_dictada",
      texto:
        registradas === 0
          ? tocaba === 1
            ? "No se registró la clase que tocaba."
            : `No se registró ninguna de las ${tocaba} clases que tocaban.`
          : `${sinRegistrar === 1 ? "Falta 1" : `Faltan ${sinRegistrar}`} de las ${tocaba} clases que tocaban.`,
    };
  }
  const base = f.presentes + f.ausentes;
  if (f.clases > 0 && base > 0) {
    const pct = Math.round((f.presentes / base) * 100);
    if (pct < 60) return { tipo: "se_vacia", texto: `Solo el ${pct}% de asistencia: el grupo se está vaciando.` };
  }
  if (f.clasesSinCerrar > 0) {
    return {
      tipo: "sin_cerrar",
      texto:
        f.clasesSinCerrar === 1
          ? "Una clase ya pasó y nadie la cerró."
          : `${f.clasesSinCerrar} clases ya pasaron y nadie las cerró.`,
    };
  }
  return null;
}

/** Asistencia = presentes ÷ lo REGISTRADO (presentes + ausentes). Las excusas
 *  médicas no cuentan: no se cobran y no son desenganche. */
export function pctAsistencia(presentes: number, ausentes: number): number | null {
  const base = presentes + ausentes;
  return base > 0 ? Math.round((presentes / base) * 100) : null;
}
