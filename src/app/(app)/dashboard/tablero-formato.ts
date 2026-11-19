/**
 * Piezas compartidas del dashboard del superadministrador: colores, formatos de dinero y
 * los tipos de los datos que el servidor le pasa a las gráficas. No lleva "use client":
 * lo usan tanto la pantalla (servidor) como los paneles (navegador).
 */

/**
 * Tonos del tablero. Son los del modo claro de globals.css (`--card`, `--muted`,
 * `--border`, `--foreground`, `--muted-foreground`, `--destructive`…): ECharts dibuja en
 * un lienzo y necesita el valor, no la variable. Si cambias uno allá, cambia el de acá.
 */
export const TABLERO = {
  tarjeta: "#ffffff",
  suave: "#eef1f1",
  linea: "#e4e8ea",
  eje: "#c3cbd0",
  tinta: "#16181a",
  /** Court Charcoal: el dato principal. La lima sobre blanco casi no se lee como barra
   *  (contraste 1,4:1), así que queda de acento: rellenos de área y la barra de zoom. */
  carbon: "#37474f",
  tenue: "#5c6b73",
  lima: "#d4e157",
  ambar: "#f2b53d",
  rojo: "#ba1a1a",
  /** La serie con la que se compara (el periodo anterior). */
  previo: "#8a979e",
  /** "Otros" y todo servicio sin color propio. */
  gris: "#b9bdb6",
  tenis: "#2a78d6",
  /** La lima oscurecida para que se vea sobre blanco. */
  padel: "#8fa01f",
} as const;

/**
 * Marcas de fuente. Un lienzo no entiende `var(--font-…)`, y next/font le pone a cada
 * familia un nombre generado que no se puede escribir a mano; `echart.tsx` cambia estas
 * marcas por la familia real justo antes de dibujar.
 */
export const FUENTE = "@fuente";
export const FUENTE_TITULO = "@titulo";

/**
 * Un color por servicio, por `servicios.clave`. Es el MISMO en las tres formas de
 * "Ingreso por servicio" (barras, dona, bloques) y en "Los últimos 7 días".
 *
 * No se usa `servicios.color`: sobre tarjeta blanca, los tonos del catálogo de Academia
 * Competencia Tenis y Academia Recreativa Tenis se confunden en la dona (ΔE 9,8 con
 * daltonismo simulado). Estos salen del validador de paletas de la skill `dataviz`.
 *
 * ⚠️ Catorce colores NO se distinguen todos contra todos: el techo real son unos nueve
 * (ver handoff §11). Están validados para que cada uno se despegue de sus VECINOS en el
 * orden de facturación de nov-2026; por eso ninguna gráfica deja el color solo: el nombre
 * va siempre escrito al lado (barras, bloques) o en la lista de debajo (dona).
 * Un servicio que no esté aquí sale en gris en barras y bloques, y toma un color libre
 * cuando entra a la dona o a la pila de la semana (`coloresDe`).
 */
const COLOR_SERVICIO: Record<string, string> = {
  patrocinio: "#6250d6",
  academia_tenis: "#1baf7a",
  alto_rendimiento_tenis: "#eda100", // Academia Competencia Tenis
  clases_tenis: "#2a78d6",
  cafeteria: "#eb6834",
  academia_padel: "#0e8fa0",
  clases_padel: "#e34948",
  preparacion_fisica: "#184f95",
  convenios_colegios: "#e87ba4", // Alianzas colegios
  alquiler_tenis: "#008300",
  almacen: "#9b4fc4",
  alquiler_padel: "#8fa01f",
  matricula_tenis: "#463dc3",
  torneo: "#b0733a",
};
/**
 * Todos los tonos, en el orden en que se pueden poner uno junto al otro. Los ocho
 * primeros son los que el validador aprobó como vecinos; sirve para apilar (naranja y
 * rojo pegados no se distinguen) y de reserva para un servicio sin color propio.
 */
const ORDEN = [
  "#2a78d6",
  "#eb6834",
  "#1baf7a",
  "#eda100",
  "#e87ba4",
  "#008300",
  "#6250d6",
  "#e34948",
  "#0e8fa0",
  "#184f95",
  "#9b4fc4",
  "#8fa01f",
  "#463dc3",
  "#b0733a",
];

/** El color propio de un servicio, o `null` si no tiene. */
export function colorDeServicio(clave: string | null | undefined): string | null {
  return (clave && COLOR_SERVICIO[clave]) || null;
}

/** Posición de un color en el orden validado (para decidir en qué orden se apilan). */
export function turnoDeColor(color: string): number {
  const i = ORDEN.indexOf(color);
  return i < 0 ? ORDEN.length : i;
}

/** Un color por servicio para UNA gráfica: el suyo si lo tiene; si no, uno libre. */
export function coloresDe(propios: (string | null)[]): string[] {
  const usados = new Set(propios.filter((c): c is string => !!c));
  return propios.map((propio) => {
    if (propio) return propio;
    const libre = ORDEN.find((c) => !usados.has(c)) ?? TABLERO.gris;
    usados.add(libre);
    return libre;
  });
}

/** Un color sRGB ("#rrggbb") en OKLab, el espacio donde la distancia se parece a lo que ve el ojo. */
function oklab(hex: string): [number, number, number] {
  const lineal = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [lineal(1), lineal(3), lineal(5)];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const t = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * t,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * t,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * t,
  ];
}

/** Qué tan distintos se ven dos colores (ΔE en OKLab × 100, la misma medida del validador de paletas). */
export function distancia(a: string, b: string): number {
  const [x, y] = [oklab(a), oklab(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) * 100;
}

/** Por debajo de esto, dos tonos pegados se leen como uno (el piso de "visión normal" del validador). */
const MINIMO_ENTRE_VECINOS = 15;

/**
 * Reacomoda una lista (que llega de mayor a menor) para que dos tonos parecidos no queden
 * uno al lado del otro. Hace falta en la dona: ahí el color es lo único que une cada
 * tajada con su renglón de la lista, y según el periodo pueden quedar vecinas Cafetería
 * (naranja) y Clases de pádel (rojo), que pegadas no se distinguen.
 *
 * Prueba los órdenes posibles empezando por el más parecido al original y se queda con el
 * primero sin vecinos parecidos; así conserva el orden por tamaño todo lo que puede. Son
 * cinco tajadas (120 órdenes): no hace falta nada más fino. Si ningún orden sirve, o la
 * lista es larga, la devuelve como llegó.
 */
export function sinVecinosParecidos<X extends { color: string }>(lista: X[]): X[] {
  if (lista.length < 3 || lista.length > 7) return lista;
  const sirve = (orden: X[]) => orden.every((x, i) => i === 0 || distancia(x.color, orden[i - 1].color) >= MINIMO_ENTRE_VECINOS);
  /** Los órdenes en secuencia lexicográfica: el primero es el original. */
  const buscar = (hecho: X[], resto: X[]): X[] | null => {
    if (!sirve(hecho)) return null;
    if (resto.length === 0) return hecho;
    for (let i = 0; i < resto.length; i++) {
      const r = buscar([...hecho, resto[i]], [...resto.slice(0, i), ...resto.slice(i + 1)]);
      if (r) return r;
    }
    return null;
  };
  return buscar([], lista) ?? lista;
}

/** Tinta que se lee sobre un bloque de ese color: oscura sobre los claros, blanca sobre los oscuros. */
export function tintaSobre(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b > 140 ? TABLERO.tinta : "#ffffff";
}

// ───────── Formatos ─────────
// A mano y no con Intl: estos textos se pintan en el servidor y en el navegador, y el
// español de Intl no da lo mismo en los dos (ver handoff §11, el espacio fino de "p. m.").

/** "$113,9 M". Espacio duro antes de la M para que una etiqueta no se parta en dos líneas. */
export function M(n: number): string {
  return "$" + (n / 1e6).toFixed(1).replace(".", ",") + "\u00a0M";
}
/** "$113.883.917". */
export function P(n: number): string {
  const s = String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return (n < 0 ? "−$" : "$") + s;
}
/** Millones arriba de un millón; pesos completos por debajo (un "$0,2 M" no dice nada). */
export function corto(n: number): string {
  return Math.abs(n) >= 1e6 ? M(n) : P(n);
}
/** Marcas del eje: "$12 M", "$500 mil", "$0". */
export function ejeM(v: number): string {
  if (!v) return "$0";
  if (Math.abs(v) >= 1e6) return "$" + String(Math.round((v / 1e6) * 10) / 10).replace(".", ",") + " M";
  return "$" + Math.round(v / 1e3) + " mil";
}
/** En celular "Academia Recreativa Tenis" y "Academia Recreativa Pádel" se cortaban igual. */
export function abrev(s: string): string {
  return s.replace("Academia Recreativa", "Acad. Rec.").replace("Academia Competencia", "Acad. Comp.");
}
/** Los nombres de servicio llegan de Siigo: se escapan antes de meterlos en un tooltip. */
export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
/**
 * Variación frente al periodo anterior: "+13%", "−25%", "igual", "nuevo" (cuando no había
 * con qué comparar). `decimales: 1` para la cifra grande ("+12,9%").
 */
export function variacion(actual: number, previo: number, decimales = 0): { texto: string; signo: 1 | 0 | -1 } {
  if (previo <= 0) return { texto: "nuevo", signo: actual > 0 ? 1 : 0 };
  const factor = 10 ** decimales;
  const d = Math.round(((actual - previo) / previo) * 100 * factor) / factor;
  if (d === 0) return { texto: "igual", signo: 0 };
  return { texto: (d > 0 ? "+" : "−") + Math.abs(d).toFixed(decimales).replace(".", ",") + "%", signo: d > 0 ? 1 : -1 };
}

// ───────── Datos que viajan del servidor a las gráficas ─────────

export type SerieDiaria = {
  /** Texto del eje: "18", "18 nov"… */
  etiquetas: string[];
  /** Texto largo para el tooltip: "miércoles 18 de noviembre". */
  titulos: string[];
  /** `null` = día sin datos todavía (hoy, por el rezago de Siigo). */
  montos: (number | null)[];
};

export type LadoComparativo = {
  nombre: string;
  rango: string;
  acum: (number | null)[];
  /** La fecha corta de cada día ("4 nov"), para anotar el salto más grande. */
  marcas?: string[];
};

export type DatoServicio = { id: number; nombre: string; color: string | null; actual: number; previo: number };

/** Un servicio que subió o bajó frente al periodo anterior ("+191%", "−60%", "nuevo"). */
export type Movimiento = { id: number; nombre: string; texto: string };

export type DiaSemana = {
  etiqueta: string;
  titulo: string;
  /** `null` = hoy sin facturas todavía. */
  monto: number | null;
  facturas: number;
  partes: { id: number; nombre: string; color: string | null; total: number }[];
};

/** Un día típico de la semana: % medio de canchas ocupadas en cada hora. */
export type RelojCanchas = {
  horas: { label: string; detalle: string }[];
  tenis: number[];
  padel: number[];
};

export type Entrenador = { nombre: string; clases: number; deportes: ("tenis" | "padel")[] };
