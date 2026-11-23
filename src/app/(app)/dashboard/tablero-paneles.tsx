"use client";

import { useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import type { EChartsCoreOption } from "echarts/core";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { EChart } from "./echart";
import {
  TABLERO as T,
  FUENTE,
  FUENTE_TITULO,
  M,
  P,
  corto,
  ejeM,
  abrev,
  esc,
  coloresDe,
  turnoDeColor,
  tintaSobre,
  sinVecinosParecidos,
  variacion,
  type SerieDiaria,
  type LadoComparativo,
  type DatoServicio,
  type Movimiento,
  type DiaSemana,
  type RelojCanchas,
} from "./tablero-formato";

/**
 * Los paneles con gráfica del dashboard. Cada uno guarda su propia "forma" (barras,
 * línea, dona…) y arma la opción de ECharts a partir de los datos que le pasa el
 * servidor. Las opciones se arman AQUÍ y no en el servidor porque llevan funciones
 * (formatos de eje, tooltips), y una función no puede cruzar de servidor a cliente.
 */

type Op = EChartsCoreOption;

// ───────── Tamaño de pantalla ─────────
// Con useSyncExternalStore y no con un estado + efecto: en el servidor responde "no" y en
// el navegador se corrige solo al montar, sin parpadeo de hidratación.
const escuchar = (consulta: string) => (aviso: () => void) => {
  const m = window.matchMedia(consulta);
  m.addEventListener("change", aviso);
  return () => m.removeEventListener("change", aviso);
};
const ANGOSTO = "(max-width: 640px)";
/** Desde aquí la rejilla pasa a 12 columnas (`xl` de Tailwind). */
const AMPLIO = "(min-width: 1280px)";
const escucharAngosto = escuchar(ANGOSTO);
const escucharAmplio = escuchar(AMPLIO);
function useAngosto() {
  return useSyncExternalStore(escucharAngosto, () => window.matchMedia(ANGOSTO).matches, () => false);
}
function useAmplio() {
  return useSyncExternalStore(escucharAmplio, () => window.matchMedia(AMPLIO).matches, () => false);
}

// ───────── Armazón de un panel, selector de forma y variación ─────────

export function Panel({
  titulo,
  sub,
  controles,
  children,
  className,
}: {
  titulo: string;
  sub?: ReactNode;
  controles?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    // `flex flex-col`: es lo que deja que una gráfica con `minimo` se estire hasta igualar
    // el alto de la tarjeta vecina.
    <section className={cn("bg-card border-border flex min-w-0 flex-col gap-3 rounded-xl border p-5 shadow-sm", className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2.5">
        <div className="min-w-0 flex-[1_1_200px]">
          <h2 className="font-heading text-sm font-bold tracking-wider uppercase">{titulo}</h2>
          {sub && <p className="text-muted-foreground mt-1 text-xs">{sub}</p>}
        </div>
        {controles && <div className="flex flex-wrap gap-2">{controles}</div>}
      </div>
      {children}
    </section>
  );
}

function Selector<V extends string>({
  etiqueta,
  opciones,
  valor,
  onCambio,
}: {
  etiqueta: string;
  opciones: readonly (readonly [V, string])[];
  valor: V;
  onCambio: (v: V) => void;
}) {
  return (
    // Mismo aspecto que el selector de periodo de arriba, para que se lean como la misma pieza.
    <div role="group" aria-label={etiqueta} className="bg-muted inline-flex flex-wrap gap-0.5 rounded-lg p-1">
      {opciones.map(([v, texto]) => (
        <button
          key={v}
          type="button"
          aria-pressed={v === valor}
          onClick={() => onCambio(v)}
          className={cn(
            "min-h-9 rounded-md px-3 text-[13px] font-semibold whitespace-nowrap transition-colors",
            v === valor ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {texto}
        </button>
      ))}
    </div>
  );
}

/** Verde oliva oscuro: el "subió" que sí se lee sobre blanco (la lima no alcanza). */
const SUBE = "text-[#46530a]";
const BAJA = "text-destructive";

/** Variación con flecha: el color solo no basta para leerla. `conSigno` escribe "+13%". */
export function Delta({ v, conSigno, className }: { v: { texto: string; signo: 1 | 0 | -1 }; conSigno?: boolean; className?: string }) {
  if (v.signo === 0) return <strong className={className}>{v.texto}</strong>;
  const texto = conSigno || v.texto === "nuevo" ? v.texto : v.texto.replace(/^[+−]/, "");
  return (
    <span className={cn("font-bold whitespace-nowrap", v.signo > 0 ? SUBE : BAJA, className)}>
      {v.signo > 0 ? "▲" : "▼"} {texto}
    </span>
  );
}

// ───────── Piezas comunes de las opciones ─────────

const TIP = {
  confine: true,
  backgroundColor: T.tarjeta,
  borderColor: T.linea,
  textStyle: { color: T.tinta, fontFamily: FUENTE, fontSize: 12 },
  extraCssText: "box-shadow: 0 8px 18px -6px rgba(22,24,26,0.18);",
};
const base = (): Op => ({
  backgroundColor: "transparent",
  animationDuration: 600,
  animationDurationUpdate: 750,
  textStyle: { fontFamily: FUENTE, color: T.tenue },
});
const tipEje = (extra?: object) => ({
  ...TIP,
  trigger: "axis",
  axisPointer: { type: "shadow", shadowStyle: { color: "rgba(55,71,79,0.06)" } },
  ...extra,
});
const cat = (data: string[], extra?: object) => ({
  type: "category",
  data,
  axisLine: { lineStyle: { color: T.eje } },
  axisTick: { show: false },
  axisLabel: { color: T.tenue, fontSize: 11, hideOverlap: true },
  ...extra,
});
const val = (extra?: object) => ({
  type: "value",
  splitNumber: 4,
  axisLabel: { color: T.tenue, fontSize: 11, formatter: ejeM },
  splitLine: { lineStyle: { color: T.linea } },
  axisLine: { show: false },
  ...extra,
});
const leyenda = (extra?: object) => ({
  textStyle: { color: T.tenue, fontSize: 12, fontFamily: FUENTE },
  itemWidth: 12,
  itemHeight: 8,
  icon: "roundRect",
  ...extra,
});
const dinero = (v: unknown) => (v == null || v === "-" ? "sin datos todavía" : P(Number(v)));
/** El acento de marca, como relleno suave bajo una línea. */
const LIMA_SUAVE = {
  type: "linear",
  x: 0,
  y: 0,
  x2: 0,
  y2: 1,
  colorStops: [
    { offset: 0, color: "rgba(212,225,87,0.55)" },
    { offset: 1, color: "rgba(212,225,87,0.04)" },
  ],
};

type PuntoTip = { dataIndex: number; marker: string; seriesName: string; value: unknown };
/** Tooltip de eje con título propio (la fecha larga en vez de la marca corta del eje). */
const tipConTitulo = (titulos: string[], formato: (v: unknown) => string) =>
  tipEje({
    formatter: (ps: PuntoTip[]) =>
      `<b>${esc(titulos[ps[0].dataIndex] ?? "")}</b><br>` +
      ps.map((p) => `${p.marker} ${esc(p.seriesName)}: <b>${formato(p.value)}</b>`).join("<br>"),
  });

const sinColaVacia = <V,>(a: (V | null)[]): (V | null)[] => {
  const b = [...a];
  while (b.length && b[b.length - 1] == null) b.pop();
  return b;
};

// ═════════════════════ Minigráficas de los indicadores ═════════════════════

function opChispa(valores: (number | null)[], forma: "barras" | "area"): Op {
  const datos = sinColaVacia(valores);
  return {
    backgroundColor: "transparent",
    grid: { left: 0, right: 0, top: 3, bottom: 0 },
    xAxis: { type: "category", show: false, data: datos.map((_, i) => String(i)) },
    yAxis: { type: "value", show: false },
    series: [
      forma === "barras"
        ? { type: "bar", data: datos, barMaxWidth: 7, itemStyle: { color: T.carbon, borderRadius: [2, 2, 0, 0] } }
        : { type: "line", data: datos, symbol: "none", lineStyle: { width: 2, color: T.carbon }, areaStyle: { color: LIMA_SUAVE } },
    ],
  };
}

/** La tendencia de un indicador, sin ejes ni cifras: solo la forma. La cifra va escrita arriba. */
export function Chispa({ valores, forma, etiqueta }: { valores: (number | null)[]; forma: "barras" | "area"; etiqueta: string }) {
  const opcion = useMemo(() => opChispa(valores, forma), [valores, forma]);
  return <EChart opcion={opcion} alto={36} etiqueta={etiqueta} />;
}

// ═════════════════════ Cobrado por día ═════════════════════

type FormaCobro = "barras" | "linea" | "area";

function opCobro(serie: SerieDiaria, forma: FormaCobro, angosto: boolean): Op {
  const conDato = serie.montos.filter((v): v is number => v != null);
  const max = Math.max(0, ...conDato);
  const promedio = conDato.length ? conDato.reduce((s, v) => s + v, 0) / conDato.length : 0;
  const enLinea = forma !== "barras";
  return {
    ...base(),
    grid: { left: 52, right: 16, top: 30, bottom: 70 },
    xAxis: cat(serie.etiquetas, { axisLabel: { color: T.tenue, fontSize: 11, hideOverlap: true, showMaxLabel: true } }),
    yAxis: val(),
    tooltip: tipConTitulo(serie.titulos, dinero),
    // Solo la barra de abajo. El zoom con la rueda del ratón se dejó fuera a propósito:
    // secuestra el desplazamiento de la página cuando el cursor pasa sobre la gráfica.
    dataZoom: [
      {
        type: "slider",
        height: 20,
        bottom: 8,
        borderColor: T.linea,
        backgroundColor: T.suave,
        fillerColor: "rgba(212,225,87,0.40)",
        dataBackground: { lineStyle: { color: T.eje }, areaStyle: { color: T.linea } },
        selectedDataBackground: { lineStyle: { color: T.carbon }, areaStyle: { color: "rgba(55,71,79,0.18)" } },
        handleStyle: { color: T.carbon, borderColor: T.carbon },
        moveHandleStyle: { color: T.eje },
        textStyle: { color: T.tenue, fontSize: 10, fontFamily: FUENTE },
        brushSelect: false,
      },
    ],
    series: [
      {
        id: "cobro",
        name: "Cobrado",
        type: enLinea ? "line" : "bar",
        universalTransition: true,
        data: serie.montos,
        barMaxWidth: 22,
        itemStyle: { color: T.carbon, borderRadius: enLinea ? 0 : [4, 4, 0, 0] },
        lineStyle: { width: 2.5, color: T.carbon },
        symbol: "circle",
        symbolSize: 6,
        showSymbol: serie.montos.length <= 35,
        areaStyle: forma === "area" ? { color: LIMA_SUAVE } : undefined,
        // El promedio va escrito sobre su línea y con fondo: si cae encima de una barra, se sigue leyendo.
        markLine:
          max > 0
            ? {
                silent: true,
                symbol: "none",
                lineStyle: { color: T.tenue, type: "dashed", width: 1 },
                label: {
                  color: T.carbon,
                  fontSize: 11,
                  fontWeight: 600,
                  position: "insideEndTop",
                  backgroundColor: "rgba(255,255,255,0.9)",
                  padding: [2, 5],
                  borderRadius: 3,
                  formatter: (angosto ? "Prom. " : "Promedio ") + M(promedio),
                },
                data: [{ yAxis: promedio }],
              }
            : undefined,
        // Solo el día más alto lleva su cifra escrita: una cifra en cada barra no se lee.
        markPoint:
          max > 0
            ? {
                symbol: "circle",
                symbolSize: 1,
                label: { color: T.tinta, fontWeight: 700, fontSize: 11, offset: [0, -12], formatter: (p: { value: number }) => M(p.value) },
                data: [{ type: "max", name: "Día más alto" }],
              }
            : undefined,
      },
    ],
  };
}

const FORMAS_COBRO = [
  ["barras", "Barras"],
  ["linea", "Línea"],
  ["area", "Área"],
] as const;

export function PanelCobro({ serie, sub, className }: { serie: SerieDiaria; sub: ReactNode; className?: string }) {
  const [forma, setForma] = useState<FormaCobro>("barras");
  const angosto = useAngosto();
  const amplio = useAmplio();
  const opcion = useMemo(() => opCobro(serie, forma, angosto), [serie, forma, angosto]);
  return (
    <Panel
      titulo="Cobrado por día"
      sub={sub}
      className={className}
      controles={<Selector etiqueta="Forma de la gráfica" opciones={FORMAS_COBRO} valor={forma} onCambio={setForma} />}
    >
      <EChart opcion={opcion} minimo={amplio ? 340 : 290} etiqueta="Ingreso cobrado por día en el periodo" />
    </Panel>
  );
}

// ═════════════════════ Facturado: periodo actual vs. anterior ═════════════════════

function opComparativo(actual: LadoComparativo, previo: LadoComparativo): Op {
  const a = sinColaVacia(actual.acum);
  const p = sinColaVacia(previo.acum);
  const n = Math.max(actual.acum.length, previo.acum.length);
  const dias = Array.from({ length: n }, (_, i) => String(i + 1));

  // El salto más grande de un día a otro se anota SOLO si explica buena parte del total
  // (un patrocinio que entra de golpe): si no, sería una etiqueta sobre una curva pareja.
  let iSalto = -1;
  let salto = 0;
  a.forEach((v, i) => {
    const antes = i === 0 ? 0 : a[i - 1];
    if (v == null || antes == null) return;
    if (v - antes > salto) {
      salto = v - antes;
      iSalto = i;
    }
  });
  const total = (a[a.length - 1] as number | undefined) ?? 0;
  const marca = iSalto >= 0 ? actual.marcas?.[iSalto] : undefined;
  const anotar = !!marca && total > 0 && salto / total >= 0.2;

  const fin = (color: string, peso: number) => ({
    show: true,
    formatter: (pt: { value: number }) => M(pt.value),
    color,
    fontWeight: peso,
    fontSize: 11,
  });
  return {
    ...base(),
    grid: { left: 54, right: 70, top: 36, bottom: 30 },
    legend: leyenda({ top: 0, left: 0 }),
    xAxis: cat(dias, { axisLabel: { color: T.tenue, fontSize: 11, hideOverlap: true, showMaxLabel: true } }),
    yAxis: val(),
    tooltip: tipConTitulo(
      dias.map((d) => `Día ${d} del periodo`),
      dinero,
    ),
    series: [
      {
        name: actual.nombre,
        type: "line",
        // Sin la cola vacía (hoy sin datos): así la línea termina donde terminan los
        // datos y la cifra del final queda pegada al último día real.
        data: a,
        showSymbol: false,
        lineStyle: { width: 2.5, color: T.carbon },
        itemStyle: { color: T.carbon },
        areaStyle: { color: LIMA_SUAVE },
        endLabel: fin(T.tinta, 700),
        markPoint: anotar
          ? {
              symbol: "circle",
              symbolSize: 10,
              itemStyle: { color: T.carbon, borderColor: T.tarjeta, borderWidth: 2 },
              label: {
                color: T.tinta,
                fontSize: 11,
                // Si el salto cae al final, la nota va hacia la izquierda para no salirse.
                position: iSalto > n * 0.6 ? "left" : "right",
                distance: 8,
                formatter: `${marca}: +${M(salto)}`,
              },
              data: [{ coord: [dias[iSalto], a[iSalto]] }],
            }
          : undefined,
      },
      {
        name: previo.nombre,
        type: "line",
        data: p,
        showSymbol: false,
        lineStyle: { width: 2, color: T.previo },
        itemStyle: { color: T.previo },
        endLabel: fin(T.tenue, 400),
      },
    ],
  };
}

export function PanelComparativo({
  titulo,
  actual,
  previo,
  total,
  totalTexto,
  totalPrevio,
  className,
}: {
  titulo: string;
  actual: LadoComparativo;
  previo: LadoComparativo;
  /** Lo facturado en el periodo y en el anterior: la cifra grande y su variación. */
  total: number;
  /** El total ya escrito ("$ 172.667.363"). Lo formatea el servidor: con Intl aquí, el texto
   *  podría no coincidir entre servidor y navegador (ver handoff §11). */
  totalTexto: string;
  totalPrevio: number;
  className?: string;
}) {
  const amplio = useAmplio();
  const opcion = useMemo(() => opComparativo(actual, previo), [actual, previo]);
  return (
    <Panel titulo={titulo} sub="Acumulado · lo emitido en facturas, no lo cobrado" className={className}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <span className="font-heading text-[clamp(1.5rem,7vw,1.875rem)] leading-tight font-extrabold tracking-tight tabular-nums">{totalTexto}</span>
        <Delta v={variacion(total, totalPrevio, 1)} conSigno className="text-[15px] font-semibold" />
        <p className="text-muted-foreground basis-full text-xs">
          Facturado · {actual.rango} vs. {previo.rango}
        </p>
      </div>
      <EChart opcion={opcion} minimo={amplio ? 300 : 280} etiqueta={`Facturado acumulado: ${actual.nombre} frente a ${previo.nombre}`} />
    </Panel>
  );
}

// ═════════════════════ Los últimos 7 días ═════════════════════

type FormaSemana = "servicio" | "total";

function opSemana(dias: DiaSemana[], forma: FormaSemana, angosto: boolean): Op {
  const barra = angosto ? 30 : 54;
  const comun = {
    ...base(),
    xAxis: cat(dias.map((d) => d.etiqueta)),
    yAxis: val(),
    tooltip: tipConTitulo(
      dias.map((d) => d.titulo),
      dinero,
    ),
  };
  if (forma === "total") {
    return {
      ...comun,
      grid: { left: 52, right: 14, top: 28, bottom: 30 },
      series: [
        {
          name: "Cobrado",
          type: "bar",
          data: dias.map((d) => d.monto),
          barWidth: "46%",
          barMaxWidth: barra,
          itemStyle: { color: T.carbon, borderRadius: [4, 4, 0, 0] },
          label: {
            show: true,
            position: "top",
            color: T.tinta,
            fontSize: angosto ? 10 : 11,
            fontWeight: 700,
            // En celular sin el espacio: con siete barras, tres cifras seguidas se pisaban.
            formatter: (p: { value: number | null }) => (p.value == null ? "" : angosto ? M(p.value).replace(" ", "") : M(p.value)),
          },
        },
      ],
    };
  }
  // Por servicio: los cuatro que más pesaron en la semana y "Otros". Más de cinco colores
  // apilados ya no se distinguen.
  const totales = new Map<number, { nombre: string; color: string | null; total: number }>();
  for (const d of dias) {
    for (const p of d.partes) {
      const t = totales.get(p.id) ?? { nombre: p.nombre, color: p.color, total: 0 };
      t.total += p.total;
      totales.set(p.id, t);
    }
  }
  const orden = [...totales.entries()].sort((x, y) => y[1].total - x[1].total);
  const mayores = orden.slice(0, 4);
  const coloresMayores = coloresDe(mayores.map(([, t]) => t.color));
  // Se apilan en el orden en que los colores fueron validados como vecinos, no por
  // tamaño: por tamaño, Cafetería (naranja) y Clases de pádel (rojo) quedaban pegadas y
  // no se distinguían.
  const turno = mayores.map((_, i) => i).sort((x, y) => turnoDeColor(coloresMayores[x]) - turnoDeColor(coloresMayores[y]));
  const top = turno.map((i) => mayores[i]);
  const colores = turno.map((i) => coloresMayores[i]);
  const parte = (d: DiaSemana, id: number) => d.partes.filter((p) => p.id === id).reduce((s, p) => s + p.total, 0);
  const series: object[] = top.map(([id, t], i) => ({
    name: t.nombre,
    type: "bar",
    stack: "dia",
    barWidth: "46%",
    barMaxWidth: barra,
    data: dias.map((d) => (d.monto == null ? null : parte(d, id))),
    itemStyle: { color: colores[i], borderColor: T.tarjeta, borderWidth: 1 },
  }));
  if (orden.length > top.length) {
    series.push({
      name: "Otros",
      type: "bar",
      stack: "dia",
      barWidth: "46%",
      barMaxWidth: barra,
      data: dias.map((d) => (d.monto == null ? null : Math.max(0, d.monto - top.reduce((s, [id]) => s + parte(d, id), 0)))),
      itemStyle: { color: T.gris, borderColor: T.tarjeta, borderWidth: 1 },
    });
  }
  return { ...comun, grid: { left: 52, right: 14, top: 14, bottom: angosto ? 96 : 76 }, legend: leyenda({ bottom: 0, left: 0 }), series };
}

const FORMAS_SEMANA = [
  ["servicio", "Por servicio"],
  ["total", "Total"],
] as const;

export function PanelSemana({ dias, sub, className }: { dias: DiaSemana[]; sub: ReactNode; className?: string }) {
  const [forma, setForma] = useState<FormaSemana>("servicio");
  const angosto = useAngosto();
  const amplio = useAmplio();
  const opcion = useMemo(() => opSemana(dias, forma, angosto), [dias, forma, angosto]);
  return (
    <Panel
      titulo="Los últimos 7 días"
      sub={sub}
      className={className}
      controles={<Selector etiqueta="Forma de la gráfica" opciones={FORMAS_SEMANA} valor={forma} onCambio={setForma} />}
    >
      <EChart opcion={opcion} minimo={amplio ? 320 : 300} etiqueta="Ingreso cobrado en cada uno de los últimos siete días" />
    </Panel>
  );
}

// ═════════════════════ Ingreso por servicio ═════════════════════

type FormaServicios = "barras" | "dona" | "bloques";
type Tajada = { nombre: string; valor: number; color: string };

const cuotaDe = (v: number, total: number) => {
  const c = total > 0 ? (v / total) * 100 : 0;
  return c < 1 ? "menos de 1%" : Math.round(c) + "%";
};

/** "menos de 1%" no cabe en una columna angosta. */
const cuotaCorta = (v: number, total: number) => cuotaDe(v, total).replace("menos de 1%", "<1%");

/** La dona muestra los cinco mayores y junta el resto: más de seis tajadas ya no se leen. */
function tajadas(servicios: DatoServicio[]): Tajada[] {
  const top = servicios.slice(0, 5);
  const colores = coloresDe(top.map((s) => s.color));
  const partes = top.map((s, i) => ({ nombre: s.nombre, valor: s.actual, color: colores[i] }));
  const resto = servicios.slice(5);
  if (resto.length) {
    partes.push({
      nombre: resto.length === 1 ? resto[0].nombre : `Otros ${resto.length} servicios`,
      valor: resto.reduce((t, s) => t + s.actual, 0),
      color: T.gris,
    });
  }
  return partes;
}

function opServicios(servicios: DatoServicio[], partes: Tajada[], total: number, forma: FormaServicios): Op {
  const cuota = (v: number) => cuotaDe(v, total);
  const cambio = (s: DatoServicio) => {
    const v = variacion(s.actual, s.previo);
    return v.texto === "nuevo" ? "nuevo en el periodo" : v.texto === "igual" ? "igual que el periodo anterior" : v.texto + " vs. el periodo anterior";
  };
  const detalle = (s: DatoServicio) => `<b>${esc(s.nombre)}</b><br>${P(s.actual)} · ${cuota(s.actual)}<br>${cambio(s)}`;
  const tip = { ...TIP, trigger: "item" };
  const propio = (s: DatoServicio) => s.color ?? T.gris;

  if (forma === "barras") {
    return {
      ...base(),
      // Siempre en su versión compacta (nombres abreviados): la tarjeta mide un tercio del
      // ancho en escritorio y todo el ancho de un celular, y en los dos casos es angosta.
      grid: { left: 120, right: 96, top: 6, bottom: 8 },
      xAxis: { type: "value", show: false, max: servicios[0]?.actual ?? 1 },
      yAxis: cat(
        servicios.map((s) => s.nombre),
        {
          inverse: true,
          axisLine: { show: false },
          axisLabel: { color: T.tinta, fontSize: 12, width: 112, overflow: "truncate", formatter: (v: string) => abrev(v) },
        },
      ),
      tooltip: { ...tip, formatter: (p: { dataIndex: number }) => detalle(servicios[p.dataIndex]) },
      series: [
        {
          id: "servicios",
          type: "bar",
          universalTransition: true,
          barMaxWidth: 14,
          data: servicios.map((s) => ({ name: s.nombre, value: s.actual, itemStyle: { color: propio(s) } })),
          itemStyle: { borderRadius: [0, 4, 4, 0] },
          label: {
            show: true,
            position: "right",
            color: T.tinta,
            fontSize: 11,
            formatter: (p: { value: number }) => {
              const c = cuota(p.value);
              return corto(p.value) + (c.length < 5 ? " · " + c : "");
            },
          },
        },
      ],
    };
  }

  if (forma === "dona") {
    return {
      backgroundColor: "transparent",
      animationDurationUpdate: 750,
      textStyle: { fontFamily: FUENTE },
      tooltip: { ...tip, formatter: (p: { name: string; value: number }) => `<b>${esc(p.name)}</b><br>${P(p.value)} · ${cuota(p.value)}` },
      // Sin leyenda de ECharts: la lista de debajo (HTML) hace de leyenda y trae las cifras alineadas.
      title: {
        text: M(total),
        subtext: "facturado",
        left: "center",
        top: "middle",
        itemGap: 4,
        textStyle: { color: T.tinta, fontSize: 22, fontWeight: 800, fontFamily: FUENTE_TITULO },
        subtextStyle: { color: T.tenue, fontSize: 12, fontFamily: FUENTE },
      },
      series: [
        {
          id: "servicios",
          type: "pie",
          universalTransition: true,
          radius: ["60%", "90%"],
          center: ["50%", "50%"],
          avoidLabelOverlap: false,
          label: { show: false },
          labelLine: { show: false },
          itemStyle: { borderColor: T.tarjeta, borderWidth: 2 },
          // El anillo no va estrictamente de mayor a menor: dos tonos parecidos no pueden quedar
          // pegados. La lista de debajo sí conserva el orden por tamaño.
          data: sinVecinosParecidos(partes).map((x) => ({ name: x.nombre, value: x.valor, itemStyle: { color: x.color } })),
        },
      ],
    };
  }

  return {
    backgroundColor: "transparent",
    animationDurationUpdate: 750,
    textStyle: { fontFamily: FUENTE },
    tooltip: {
      ...tip,
      formatter: (p: { name: string; value: number }) => {
        const s = servicios.find((x) => x.nombre === p.name);
        return s ? detalle(s) : `<b>${esc(p.name)}</b><br>${P(p.value)}`;
      },
    },
    series: [
      {
        id: "servicios",
        type: "treemap",
        universalTransition: true,
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        roam: false,
        nodeClick: false,
        breadcrumb: { show: false },
        itemStyle: { borderColor: T.tarjeta, borderWidth: 0, gapWidth: 3 },
        label: {
          fontSize: 12,
          fontWeight: 700,
          fontFamily: FUENTE,
          overflow: "truncate",
          formatter: (p: { name: string; value: number }) => `${p.name}\n${corto(p.value)}`,
        },
        data: servicios.map((s) => ({ name: s.nombre, value: s.actual, itemStyle: { color: propio(s) }, label: { color: tintaSobre(propio(s)) } })),
      },
    ],
  };
}

const FORMAS_SERVICIOS = [
  ["barras", "Barras"],
  ["dona", "Dona"],
  ["bloques", "Bloques"],
] as const;

function ColumnaMovimientos({ titulo, sube, filas }: { titulo: string; sube: boolean; filas: Movimiento[] }) {
  return (
    <div>
      <p className={cn("mb-0.5 text-xs font-bold", sube ? SUBE : BAJA)}>
        {sube ? "▲" : "▼"} {titulo}
      </p>
      {filas.map((m) => (
        <div key={m.id} className="flex items-baseline justify-between gap-2 py-[3px] text-xs">
          <span className="min-w-0 truncate" title={m.nombre}>
            {abrev(m.nombre)}
          </span>
          <strong className={cn("shrink-0 tabular-nums", sube ? SUBE : BAJA)}>{m.texto}</strong>
        </div>
      ))}
    </div>
  );
}

/** Todos los servicios uno por uno, sin el cubo de "Otros": la dona solo muestra cinco. */
function TodosLosServicios({
  servicios,
  partes,
  total,
  sub,
  frente,
}: {
  servicios: DatoServicio[];
  partes: Tajada[];
  total: number;
  sub: ReactNode;
  frente: string;
}) {
  // Los cinco primeros llevan el color de su tajada; los demás, el gris de "Otros".
  const colorDe = (i: number) => (i < 5 && partes[i] ? partes[i].color : T.gris);
  return (
    <Dialog>
      <DialogTrigger className="self-start text-[13px] font-semibold text-[#5b6300] hover:text-[#46530a] hover:underline">
        Ver todos ({servicios.length})
      </DialogTrigger>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Ingreso por servicio</DialogTitle>
          <DialogDescription>{sub}</DialogDescription>
        </DialogHeader>
        <div className="-mx-5 min-h-0 overflow-y-auto px-5">
          <table className="w-full text-[13px]">
            <thead className="bg-popover sticky top-0">
              <tr className="text-muted-foreground border-border border-b text-[11px] font-bold tracking-wider uppercase">
                <th className="py-2 text-left font-bold">Servicio</th>
                <th className="py-2 pl-2 text-right font-bold">Facturado</th>
                <th className="hidden py-2 pl-2 text-right font-bold sm:table-cell">%</th>
                <th className="py-2 pl-2 text-right font-bold sm:pl-3">{frente}</th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {servicios.map((s, i) => (
                <tr key={s.id}>
                  <td className="py-[7px]">
                    <span className="flex items-center gap-2 leading-tight">
                      <span className="size-2.5 shrink-0 rounded-sm" style={{ background: colorDe(i) }} />
                      {s.nombre}
                    </span>
                  </td>
                  <td className="py-[7px] pl-2 text-right whitespace-nowrap tabular-nums">
                    {corto(s.actual)}
                    {/* En celular no cabe la columna del %: va debajo del monto. */}
                    <span className="text-muted-foreground block text-[11px] font-bold sm:hidden">{cuotaCorta(s.actual, total)}</span>
                  </td>
                  <td className="hidden py-[7px] pl-2 text-right font-bold whitespace-nowrap tabular-nums sm:table-cell">
                    {cuotaCorta(s.actual, total)}
                  </td>
                  <td className="py-[7px] pl-2 text-right text-xs tabular-nums sm:pl-3">
                    <Delta v={variacion(s.actual, s.previo)} conSigno />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-border border-t-2 font-bold">
                <td className="py-2">Total</td>
                <td className="py-2 pl-2 text-right whitespace-nowrap tabular-nums">{corto(total)}</td>
                <td className="hidden py-2 pl-2 text-right tabular-nums sm:table-cell">100%</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function PanelServicios({
  servicios,
  total,
  sub,
  frente,
  suben,
  bajan,
  className,
}: {
  servicios: DatoServicio[];
  total: number;
  sub: ReactNode;
  /** Título del bloque de cambios: "Frente a octubre", "Frente al periodo anterior". */
  frente: string;
  suben: Movimiento[];
  bajan: Movimiento[];
  className?: string;
}) {
  const [forma, setForma] = useState<FormaServicios>("dona");
  const partes = useMemo(() => tajadas(servicios), [servicios]);
  const opcion = useMemo(() => opServicios(servicios, partes, total, forma), [servicios, partes, total, forma]);
  const alto = forma === "dona" ? 220 : forma === "barras" ? Math.max(220, servicios.length * 27 + 22) : 400;
  return (
    <Panel
      titulo="Ingreso por servicio"
      sub={sub}
      className={className}
      controles={
        servicios.length > 0 && <Selector etiqueta="Forma de la gráfica" opciones={FORMAS_SERVICIOS} valor={forma} onCambio={setForma} />
      }
    >
      {servicios.length > 0 ? (
        <>
          <EChart opcion={opcion} alto={alto} etiqueta="Facturado del periodo repartido por servicio" />
          {/* La lista con colores solo acompaña a la dona: en barras y bloques cada marca ya lleva su nombre. */}
          {forma === "dona" && (
            <ul className="divide-border divide-y text-[13px]">
              {partes.map((x) => (
                <li key={x.nombre} className="flex items-center gap-2 py-[5px]">
                  <span className="size-2.5 shrink-0 rounded-sm" style={{ background: x.color }} />
                  <span className="min-w-0 flex-1 leading-tight">{x.nombre}</span>
                  <span className="text-muted-foreground whitespace-nowrap tabular-nums">{M(x.valor)}</span>
                  <strong className="w-9 shrink-0 text-right tabular-nums">{Math.round(total > 0 ? (x.valor / total) * 100 : 0)}%</strong>
                </li>
              ))}
            </ul>
          )}
          <TodosLosServicios servicios={servicios} partes={partes} total={total} sub={sub} frente={frente} />
        </>
      ) : (
        <p className="text-muted-foreground py-10 text-center text-sm">Sin facturación en el periodo.</p>
      )}
      {(suben.length > 0 || bajan.length > 0) && (
        <div className="border-border border-t pt-3">
          <p className="text-muted-foreground mb-2 text-[11px] font-bold tracking-wider uppercase">{frente}</p>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-x-4 gap-y-2.5">
            {suben.length > 0 && <ColumnaMovimientos titulo="Suben" sube filas={suben} />}
            {bajan.length > 0 && <ColumnaMovimientos titulo="Bajan" sube={false} filas={bajan} />}
          </div>
        </div>
      )}
    </Panel>
  );
}

// ═════════════════════ El reloj de las canchas ═════════════════════

type Dep = "tenis" | "padel";
type VistaReloj = "ambos" | Dep;
const DEPORTE: Record<Dep, { nombre: string; color: string }> = {
  tenis: { nombre: "Tenis", color: T.tenis },
  padel: { nombre: "Pádel", color: T.padel },
};

function opReloj(reloj: RelojCanchas, vista: VistaReloj): Op {
  const deportes: Dep[] = vista === "ambos" ? ["tenis", "padel"] : [vista];
  return {
    ...base(),
    legend: leyenda({ bottom: 0, left: "center" }),
    polar: { radius: ["16%", "74%"], center: ["50%", "45%"] },
    // Arranca arriba y gira como un reloj: la primera hora del día queda a las doce.
    angleAxis: {
      type: "category",
      data: reloj.horas.map((h) => h.label),
      startAngle: 90,
      axisLine: { lineStyle: { color: T.eje } },
      axisTick: { show: false },
      axisLabel: { color: T.tenue, fontSize: 11 },
      splitLine: { show: true, lineStyle: { color: T.linea } },
    },
    radiusAxis: {
      min: 0,
      max: 100,
      interval: 50,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: T.tenue, fontSize: 10, formatter: "{value}%" },
      splitLine: { lineStyle: { color: T.linea } },
    },
    tooltip: {
      ...TIP,
      trigger: "item",
      formatter: (p: { seriesName: string; dataIndex: number; value: number }) =>
        `<b>${esc(p.seriesName)}</b> · ${reloj.horas[p.dataIndex]?.detalle ?? ""}<br><b>${p.value}%</b> de las canchas ocupadas`,
    },
    series: deportes.map((d) => ({
      name: DEPORTE[d].nombre,
      type: "bar",
      coordinateSystem: "polar",
      data: reloj[d],
      itemStyle: { color: DEPORTE[d].color, borderRadius: 3 },
      barGap: "10%",
      emphasis: { focus: "series" },
    })),
  };
}

const VISTAS_RELOJ = [
  ["ambos", "Los dos"],
  ["tenis", "Tenis"],
  ["padel", "Pádel"],
] as const;

export function PanelReloj({ reloj, sub, className }: { reloj: RelojCanchas; sub: ReactNode; className?: string }) {
  const [vista, setVista] = useState<VistaReloj>("ambos");
  const amplio = useAmplio();
  const opcion = useMemo(() => opReloj(reloj, vista), [reloj, vista]);
  return (
    <Panel
      titulo="El reloj de las canchas"
      sub={sub}
      className={className}
      controles={<Selector etiqueta="Deporte" opciones={VISTAS_RELOJ} valor={vista} onCambio={setVista} />}
    >
      <EChart opcion={opcion} minimo={amplio ? 380 : 330} etiqueta="Ocupación de las canchas hora por hora, en un día típico de la semana" />
    </Panel>
  );
}
