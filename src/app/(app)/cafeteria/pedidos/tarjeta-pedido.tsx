import { nombreEstado, sigueAbierto, type EstadoPedido } from "@/lib/cafeteria/estado";
import { pesos, type LineaGuardada } from "@/lib/cafeteria/pedido";
import { fechaHoraCorta, tiempoRelativo } from "@/lib/fecha";
import { cn } from "@/lib/utils";
import { cambiarEstadoPedido } from "./actions";

export type PedidoVista = {
  id: number;
  nombre: string;
  recibido_el: string;
  ubicacion: string;
  detalle_ubicacion: string | null;
  notas: string | null;
  total: number;
  estado: string;
  lineas: LineaGuardada[];
};

const CHIP: Record<EstadoPedido, string> = {
  pendiente: "bg-[#fff1cc] text-[#8a5600]",
  en_preparacion: "bg-stadium text-primary",
  entregado: "bg-primary/30 text-[#46530a]",
  cancelado: "bg-muted text-muted-foreground",
};

export function ChipEstado({ estado }: { estado: string }) {
  return (
    <span className={cn("inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-[11px] font-bold tracking-wide uppercase", CHIP[estado as EstadoPedido] ?? CHIP.cancelado)}>
      {nombreEstado(estado)}
    </span>
  );
}

const BOTON = "h-10 rounded-lg px-3.5 text-[13px] font-bold transition active:translate-y-px";
const PRINCIPAL = cn(BOTON, "bg-stadium text-primary hover:bg-stadium/90");
const SECUNDARIO = cn(BOTON, "border-input bg-card text-foreground hover:bg-muted border-[1.5px]");
const CANCELAR = cn(BOTON, "text-destructive hover:bg-destructive/10 px-2.5");

/** A qué puede pasar un pedido por atender, con el paso siguiente destacado. */
const SIGUIENTES: Record<string, { estado: EstadoPedido; texto: string; clase: string }[]> = {
  pendiente: [
    { estado: "en_preparacion", texto: "En preparación", clase: PRINCIPAL },
    { estado: "entregado", texto: "Entregado", clase: SECUNDARIO },
    { estado: "cancelado", texto: "Cancelar", clase: CANCELAR },
  ],
  en_preparacion: [
    { estado: "entregado", texto: "Entregado", clase: PRINCIPAL },
    { estado: "pendiente", texto: "Volver a pendiente", clase: SECUNDARIO },
    { estado: "cancelado", texto: "Cancelar", clase: CANCELAR },
  ],
};

/** Para corregir un pedido que ya está en el historial: los otros tres estados. */
const CORRECCIONES: { estado: EstadoPedido; texto: string }[] = [
  { estado: "pendiente", texto: "Pendiente" },
  { estado: "en_preparacion", texto: "En preparación" },
  { estado: "entregado", texto: "Entregado" },
  { estado: "cancelado", texto: "Cancelado" },
];

/**
 * Un pedido en `/cafeteria/pedidos`.
 *
 * `porAtender` = está en la lista de hoy: lleva los botones grandes para pasarlo
 * al estado siguiente. En el historial solo muestra en qué quedó, y "Corregir
 * estado" plegado por si se marcó mal.
 *
 * Cada botón es un formulario de verdad (sin JavaScript también funciona) que
 * llama a `cambiarEstadoPedido` y vuelve a `volverA`.
 */
export function TarjetaPedido({ pedido, porAtender, volverA }: { pedido: PedidoVista; porAtender: boolean; volverA: string }) {
  const ocultos = (
    <>
      <input type="hidden" name="id" value={pedido.id} />
      <input type="hidden" name="volver" value={volverA} />
    </>
  );
  const siguientes = porAtender ? (SIGUIENTES[pedido.estado] ?? []) : [];

  return (
    <li className="bg-card flex flex-col rounded-xl shadow-sm ring-1 ring-foreground/[0.06]">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-b px-4 py-3">
        <p className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-sm font-semibold">
          <span className="min-w-0 truncate">{pedido.nombre}</span>
          <ChipEstado estado={pedido.estado} />
        </p>
        <time dateTime={pedido.recibido_el} className="text-muted-foreground shrink-0 text-xs tabular-nums">
          {fechaHoraCorta(pedido.recibido_el)}
          {porAtender && <span className="text-foreground font-semibold"> · {tiempoRelativo(pedido.recibido_el)}</span>}
        </time>
      </div>

      <div className="flex-1 space-y-2 px-4 py-3">
        <ul className="m-0 list-none space-y-1 p-0 text-sm">
          {pedido.lineas.map((l, i) => (
            <li key={i} className="flex items-baseline justify-between gap-3">
              <span>
                <span className="font-heading font-semibold tabular-nums">{l.cantidad} ×</span> {l.nombre}
                {l.opcion && <span className="text-muted-foreground"> ({l.opcion})</span>}
              </span>
              <span className="text-muted-foreground shrink-0 tabular-nums">{pesos(l.subtotal)}</span>
            </li>
          ))}
        </ul>
        {pedido.notas && <p className="bg-muted/60 rounded-md px-2.5 py-1.5 text-xs"><strong>Notas:</strong> {pedido.notas}</p>}
      </div>

      <div className="bg-muted/40 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t px-4 py-2.5 text-xs">
        <span className="text-muted-foreground">
          {pedido.ubicacion}
          {pedido.detalle_ubicacion ? ` (${pedido.detalle_ubicacion})` : ""}
        </span>
        <span className="font-heading text-foreground text-base font-semibold tabular-nums">{pesos(pedido.total)}</span>
      </div>

      {porAtender ? (
        <form action={cambiarEstadoPedido} className="flex flex-wrap items-center gap-2 rounded-b-xl border-t px-4 py-3">
          {ocultos}
          {siguientes.map((s) => (
            <button key={s.estado} type="submit" name="estado" value={s.estado} className={cn(s.clase, s.estado === "cancelado" && "ml-auto")}>
              {s.texto}
            </button>
          ))}
        </form>
      ) : (
        <details className="group rounded-b-xl border-t px-4 py-2.5 text-xs">
          <summary className="text-muted-foreground hover:text-foreground cursor-pointer list-none font-semibold [&::-webkit-details-marker]:hidden">
            Corregir estado
          </summary>
          <form action={cambiarEstadoPedido} className="flex flex-wrap gap-2 pt-2.5">
            {ocultos}
            {CORRECCIONES.filter((c) => c.estado !== pedido.estado).map((c) => (
              <button key={c.estado} type="submit" name="estado" value={c.estado} className={cn(SECUNDARIO, "h-9 text-xs")}>
                {c.texto}
              </button>
            ))}
          </form>
          {sigueAbierto(pedido.estado) && (
            <p className="text-muted-foreground pt-2">Es de un día anterior: se queda en el historial aunque no se haya cerrado.</p>
          )}
        </details>
      )}
    </li>
  );
}
