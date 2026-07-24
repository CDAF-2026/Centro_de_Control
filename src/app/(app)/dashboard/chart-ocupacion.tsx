"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type {
  Deporte,
  Ocupacion,
  OcupacionCelda,
  PanelDeporte,
  ColumnaMeta,
} from "@/lib/easycancha/ocupacion";

/** Tenis = azul de datos; pádel = lima. Misma convención que el calendario de clases. */
const COLOR: Record<Deporte, string> = { tenis: "var(--chart-3)", padel: "var(--chart-1)" };
const NOMBRE: Record<Deporte, string> = { tenis: "Tenis", padel: "Pádel" };

const pct0 = (n: number) => `${Math.round(n)}%`;

/** Trama diagonal (academia) en el color del deporte. */
const rayado = (color: string) =>
  `repeating-linear-gradient(135deg, ${color} 0 2px, color-mix(in srgb, ${color} 34%, transparent) 2px 6px)`;

/**
 * Relleno de una celda: la altura llena = ocupación (media hora → medio bloque).
 * Se apila alquiler/clases (sólido, abajo) + academia (rayado, arriba); lo que
 * queda vacío arriba es tiempo libre. Más legible que la intensidad de color.
 */
function RellenoCelda({ celda, color }: { celda: OcupacionCelda; color: string }) {
  const comercial = Math.max(0, celda.pct - celda.pctInterno);
  return (
    <span className="absolute inset-0 flex flex-col justify-end">
      {celda.pctInterno > 0.5 && (
        <span className="w-full shrink-0" style={{ height: `${celda.pctInterno}%`, backgroundImage: rayado(color) }} />
      )}
      {comercial > 0.5 && (
        <span className="w-full shrink-0" style={{ height: `${comercial}%`, backgroundColor: color }} />
      )}
    </span>
  );
}

type Celda = { fila: string; col: ColumnaMeta; celda: OcupacionCelda };

/** Un panel (un deporte): titular + rejilla canchas × columnas. */
function Panel({
  panel,
  columnas,
  onHover,
}: {
  panel: PanelDeporte;
  columnas: ColumnaMeta[];
  onHover: (c: Celda | null) => void;
}) {
  const color = COLOR[panel.deporte];
  return (
    <div>
      <div className="mb-2.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
        <span className="size-2.5 shrink-0 self-center rounded-sm" style={{ backgroundColor: color }} />
        <span className="text-sm font-semibold">{NOMBRE[panel.deporte]}</span>
        <span className="font-heading text-2xl font-bold tracking-tight tabular-nums">{pct0(panel.pct)}</span>
        <span className="text-muted-foreground text-[11px]">
          ocupación media · {pct0(panel.pctComercial)} alquiler y clases · {pct0(panel.pctInterno)} academia
          {panel.pico ? ` · pico ${panel.pico.label} ${pct0(panel.pico.pct)}` : ""}
        </span>
      </div>

      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <table className="w-full min-w-[520px] border-separate border-spacing-0.5 text-center">
          <thead>
            <tr>
              <th className="w-16" />
              {columnas.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    "text-[10px] font-semibold",
                    col.destacada ? "text-[#5b6a12]" : "text-muted-foreground/70",
                  )}
                >
                  {col.label}
                </th>
              ))}
              <th className="text-muted-foreground/50 w-11 text-[9.5px] font-bold tracking-wide uppercase">Cancha</th>
            </tr>
          </thead>
          <tbody>
            {panel.canchas.map((f) => (
              <tr key={f.numero}>
                <td className="text-muted-foreground pr-2 text-left text-[11px] font-medium whitespace-nowrap">
                  {f.label}
                </td>
                {f.celdas.map((c, j) => (
                  <td key={columnas[j].key} className={cn(columnas[j].destacada && "bg-primary/10 rounded-sm")}>
                    <button
                      type="button"
                      onMouseEnter={() => onHover({ fila: f.label, col: columnas[j], celda: c })}
                      onFocus={() => onHover({ fila: f.label, col: columnas[j], celda: c })}
                      title={`${f.label} · ${columnas[j].detalle} · ${pct0(c.pct)} ocupada${c.pctInterno > 0 ? ` (${pct0(c.pctInterno)} academia)` : ""}`}
                      aria-label={`${f.label}, ${columnas[j].detalle}: ${pct0(c.pct)} ocupada`}
                      className={cn(
                        "focus-visible:ring-ring relative block h-7 w-full overflow-hidden rounded-[5px] transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:outline-none",
                        columnas[j].futura && c.pct > 0 && "opacity-60",
                      )}
                      style={{ background: "color-mix(in srgb, var(--foreground) 6%, transparent)" }}
                    >
                      <RellenoCelda celda={c} color={color} />
                    </button>
                  </td>
                ))}
                <td className="font-heading text-foreground/80 text-xs font-bold tabular-nums">{pct0(f.pct)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="text-muted-foreground pr-2 pt-1 text-left text-[10px] font-bold">Todas</td>
              {panel.totalPorColumna.map((t, j) => (
                <td
                  key={columnas[j].key}
                  className={cn(
                    "pt-1 text-[10px] font-bold tabular-nums",
                    columnas[j].destacada ? "text-[#5b6a12]" : "text-muted-foreground/70",
                  )}
                >
                  {Math.round(t)}
                </td>
              ))}
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

/**
 * Ocupación de canchas cancha por cancha. Mapa de calor: filas = canchas,
 * columnas = horas del día (vista Hoy) o días de la semana (vista Semana),
 * en dos paneles apilados (tenis y pádel). Sin librerías: tabla + CSS.
 */
export function ChartOcupacion({ datos }: { datos: Ocupacion }) {
  const [vista, setVista] = useState<"hoy" | "semana">("hoy");
  const [hover, setHover] = useState<Celda | null>(null);

  const v = vista === "hoy" ? datos.hoy : datos.semana;
  const { apertura, cierre } = datos.horario;
  const hayDatos = v.tenis.pct > 0 || v.padel.pct > 0;

  const tabCls = (on: boolean) =>
    cn(
      "rounded-lg px-3 py-1 text-xs font-medium transition-colors",
      on ? "bg-charcoal text-white" : "text-muted-foreground hover:text-foreground hover:bg-muted",
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="bg-muted/60 flex items-center gap-1 rounded-lg p-1">
          <button type="button" onClick={() => setVista("hoy")} className={tabCls(vista === "hoy")}>
            Hoy · por hora
          </button>
          <button type="button" onClick={() => setVista("semana")} className={tabCls(vista === "semana")}>
            Semana · por día
          </button>
        </div>
        <div className="text-muted-foreground/80 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[11px]">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-4 rounded-sm" style={{ backgroundColor: COLOR.tenis }} /> Tenis
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-4 rounded-sm" style={{ backgroundColor: COLOR.padel }} /> Pádel
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-4 rounded-sm"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(135deg, var(--chart-4) 0 2px, color-mix(in srgb, var(--chart-4) 32%, transparent) 2px 6px)",
              }}
            />
            Academia
          </span>
        </div>
      </div>

      {!hayDatos ? (
        <p className="text-muted-foreground py-10 text-center text-sm">
          {datos.error
            ? "No se pudo consultar EasyCancha en este momento."
            : vista === "hoy"
              ? "Todavía no hay reservas para hoy."
              : "No hay reservas en la semana."}
        </p>
      ) : (
        <>
          <div className="space-y-5" onMouseLeave={() => setHover(null)}>
            <Panel panel={v.tenis} columnas={v.columnas} onHover={setHover} />
            <Panel panel={v.padel} columnas={v.columnas} onHover={setHover} />
          </div>

          {/* Detalle de la celda bajo el cursor; en reposo, cómo leer el mapa. */}
          <div className="text-muted-foreground border-t pt-3 text-xs">
            {hover ? (
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <strong className="text-foreground">{hover.fila}</strong>
                <span className="first-letter:uppercase">{hover.col.detalle}</span>
                <span>·</span>
                <strong className="text-foreground tabular-nums">{pct0(hover.celda.pct)} ocupada</strong>
                {hover.celda.pctInterno > 0 && (
                  <span className="tabular-nums">· {pct0(hover.celda.pctInterno)} academia</span>
                )}
                {hover.col.futura && <span className="text-muted-foreground/80">· agendado (aún no ocurre)</span>}
              </span>
            ) : (
              <span>
                Cada celda es una cancha en una {vista === "hoy" ? "hora" : "jornada"}: más color, más ocupada ·
                rayado = academia · columna <strong className="text-foreground">Cancha</strong> = % de cada cancha ·
                fila <strong className="text-foreground">Todas</strong> = {vista === "hoy" ? "hora" : "día"} pico ·
                horario {apertura}:00–{cierre}:00
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
