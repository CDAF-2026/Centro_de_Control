"use client";

import { useEffect, useRef } from "react";
import type { EChartsCoreOption, EChartsType } from "echarts/core";
import { cn } from "@/lib/utils";
import { FUENTE, FUENTE_TITULO } from "./tablero-formato";

type Nucleo = typeof import("./echarts-nucleo");
let carga: Promise<Nucleo> | null = null;
/** Una sola descarga de ECharts para todas las gráficas de la pantalla. */
const cargar = () => (carga ??= import("./echarts-nucleo"));

const distinto = (g: EChartsType, el: HTMLElement) =>
  Math.abs(g.getWidth() - el.clientWidth) > 1 || Math.abs(g.getHeight() - el.clientHeight) > 1;

/** Cambia las marcas de fuente por la familia real (ver `tablero-formato.ts`). */
function conFuentes<T>(valor: T, mapa: Record<string, string>): T {
  if (typeof valor === "string") return (mapa[valor] ?? valor) as T;
  if (Array.isArray(valor)) return valor.map((v) => conFuentes(v, mapa)) as T;
  if (valor && typeof valor === "object" && Object.getPrototypeOf(valor) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valor)) out[k] = conFuentes(v, mapa);
    return out as T;
  }
  return valor;
}

/** Arma la opción final: fuentes reales y, si la persona pidió menos movimiento, sin animación. */
function preparar(opcion: EChartsCoreOption, el: HTMLElement, quieta = false): EChartsCoreOption {
  const cs = getComputedStyle(el);
  const cuerpo = cs.getPropertyValue("--font-open-sans").trim() || cs.fontFamily;
  const titulo = cs.getPropertyValue("--font-montserrat").trim() || cuerpo;
  const lista = conFuentes(opcion, { [FUENTE]: cuerpo, [FUENTE_TITULO]: titulo });
  return quieta || window.matchMedia("(prefers-reduced-motion: reduce)").matches ? { ...lista, animation: false } : lista;
}

/**
 * Una gráfica de ECharts. Recibe la opción ya armada; al cambiar la opción la gráfica se
 * transforma en la nueva (por eso se reemplaza entera, `notMerge`).
 *
 * Tamaño, una de dos:
 *  · `alto` — altura fija en px.
 *  · `minimo` — la gráfica se ESTIRA hasta llenar su tarjeta, que a su vez iguala a la
 *    vecina de la fila. Así dos tarjetas de la misma fila terminan del mismo alto aunque
 *    una tenga más contenido. La tarjeta debe ser `flex flex-col` (lo es `Panel`).
 *
 * `etiqueta` es lo que oye un lector de pantalla: el lienzo no tiene texto.
 */
export function EChart({
  opcion,
  alto,
  minimo,
  etiqueta,
  className,
}: {
  opcion: EChartsCoreOption;
  alto?: number;
  minimo?: number;
  etiqueta: string;
  className?: string;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const grafica = useRef<EChartsType | null>(null);
  const ultima = useRef(opcion);

  useEffect(() => {
    let vivo = true;
    let observador: ResizeObserver | undefined;
    cargar().then(({ echarts }) => {
      const el = caja.current;
      if (!vivo || !el) return;
      const g = echarts.init(el, null, { renderer: "canvas" });
      grafica.current = g;
      g.setOption(preparar(ultima.current, el), true);
      // ⚠️ Solo se reajusta si el tamaño cambió DE VERDAD, y entonces se redibuja EN SECO
      // (se limpia y se pinta sin animar). Un `resize()` a mitad de una animación la deja
      // congelada a medias: pasó con la transformación barras → dona y, en el diseño, con
      // la línea de promedio, que quedaba a medio trazar cuando la tarjeta vecina crecía.
      observador = new ResizeObserver(() => {
        if (!el.clientWidth || !el.clientHeight || !distinto(g, el)) return;
        g.resize();
        g.clear();
        g.setOption(preparar(ultima.current, el, true), true);
      });
      observador.observe(el);
    });
    return () => {
      vivo = false;
      observador?.disconnect();
      grafica.current?.dispose();
      grafica.current = null;
    };
  }, []);

  useEffect(() => {
    ultima.current = opcion;
    const g = grafica.current;
    const el = caja.current;
    if (!g || !el) return;
    if (distinto(g, el)) g.resize();
    g.setOption(preparar(opcion, el), true);
  }, [opcion, alto]);

  return (
    <div
      ref={caja}
      role="img"
      aria-label={etiqueta}
      className={cn("w-full min-w-0", minimo != null && "flex-[1_1_0%] overflow-hidden", className)}
      style={minimo != null ? { minHeight: minimo } : { height: alto }}
    />
  );
}
