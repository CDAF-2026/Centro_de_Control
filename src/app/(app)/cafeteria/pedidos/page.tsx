import Link from "next/link";
import { ReceiptText } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { POR_ATENDER, esEstado, nombreEstado, sigueAbierto } from "@/lib/cafeteria/estado";
import type { LineaGuardada } from "@/lib/cafeteria/pedido";
import { hoyBogota, isoDia } from "@/lib/periodo";
import { cn } from "@/lib/utils";
import type { Json } from "@/lib/database.types";
import { Pestanas } from "../pestanas";
import { cambiarEstadoPedido } from "./actions";
import { AlDia, SEGUNDOS_ENTRE_REFRESCOS } from "./al-dia";
import { TarjetaPedido, type PedidoVista } from "./tarjeta-pedido";

const POR_PAGINA = 30;
/** Tope de la lista por atender. Un día con más de esto abiertos a la vez no es real. */
const MAX_POR_ATENDER = 200;
const COLUMNAS = "id, recibido_el, nombre, ubicacion, detalle_ubicacion, notas, pago, devuelta_de, lineas, total, estado";

type Ver = "atender" | "historial";
type Periodo = "hoy" | "semana" | "todos";
const PERIODOS: { id: Periodo; nombre: string }[] = [
  { id: "hoy", nombre: "Hoy" },
  { id: "semana", nombre: "Últimos 7 días" },
  { id: "todos", nombre: "Todos" },
];

/** Las líneas se guardan como JSON; se leen con cuidado por si alguna fila viene rara. */
function lineasDe(json: Json): LineaGuardada[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((l) => {
    if (!l || typeof l !== "object" || Array.isArray(l)) return [];
    return [{
      producto_id: Number(l.producto_id ?? 0),
      nombre: String(l.nombre ?? "Producto"),
      opcion: l.opcion ? String(l.opcion) : null,
      cantidad: Number(l.cantidad ?? 0),
      precio: Number(l.precio ?? 0),
      subtotal: Number(l.subtotal ?? 0),
    }];
  });
}

/**
 * Cafetería · pedidos (20-nov-2026, pedido de Laura).
 *
 * Dos listas para que la cafetería no se confunda:
 *   · **Por atender** — lo de HOY que sigue pendiente o en preparación, del más
 *     viejo al más nuevo (se atiende en orden de llegada).
 *   · **Historial** — lo entregado, lo cancelado y TODO lo de días anteriores,
 *     esté como esté. Por eso cada día la lista por atender arranca vacía, sin
 *     ninguna tarea nocturna: "hoy" se calcula aquí, en cada lectura.
 *
 * La pantalla se vuelve a pedir sola (`AlDia`), así que puede quedarse abierta.
 *
 * ⚠️ Cada fila es un pedido que alguien ARMÓ y mandó a WhatsApp desde la carta:
 * se registra cuando la persona toca "Enviar pedido por WhatsApp". La página no
 * puede saber si después tocó Enviar dentro de WhatsApp, así que puede haber
 * aquí algún pedido que a la cafetería nunca le llegó. La pantalla lo dice.
 *
 * Sin sumas de plata a propósito: sumar filas en la pantalla se desinfla en
 * silencio al pasar de 1.000 (regla del proyecto). Si se quiere "cuánto se
 * vendió", va en una función de la base.
 */
export default async function PedidosCafeteriaPage({
  searchParams,
}: {
  searchParams: Promise<{ ver?: string; periodo?: string; page?: string; hecho?: string; antes?: string; error?: string }>;
}) {
  await requireRole(rolesForModule("cafeteria"));
  const sp = await searchParams;
  const ver: Ver = sp.ver === "historial" ? "historial" : "atender";
  const periodo: Periodo = sp.periodo === "semana" || sp.periodo === "todos" ? sp.periodo : "hoy";
  const page = Math.max(1, Number(sp.page) || 1);

  // "Hoy" es el día de Colombia, no el del servidor (que corre en UTC).
  const hoy = hoyBogota();
  const inicioHoy = new Date(`${isoDia(hoy)}T00:00:00-05:00`).toISOString();
  const haceSiete = new Date(hoy);
  haceSiete.setDate(haceSiete.getDate() - 6);
  const inicioSemana = new Date(`${isoDia(haceSiete)}T00:00:00-05:00`).toISOString();

  const supabase = await createClient();
  const porAtender = () =>
    supabase.from("cafeteria_pedidos").select(COLUMNAS, { count: "exact" }).gte("recibido_el", inicioHoy).in("estado", POR_ATENDER);

  let filas: PedidoVista[] = [];
  let total = 0;
  let abiertos = 0;
  let fallo: string | null = null;

  if (ver === "atender") {
    const { data, count, error } = await porAtender().order("recibido_el", { ascending: true }).limit(MAX_POR_ATENDER);
    fallo = error?.message ?? null;
    filas = (data ?? []).map((p) => ({ ...p, lineas: lineasDe(p.lineas) }));
    total = abiertos = count ?? 0;
  } else {
    // Historial = cerrados (de cualquier día) + todo lo que no es de hoy.
    let consulta = supabase
      .from("cafeteria_pedidos")
      .select(COLUMNAS, { count: "exact" })
      .or(`estado.in.(entregado,cancelado),recibido_el.lt."${inicioHoy}"`)
      .order("recibido_el", { ascending: false })
      .range((page - 1) * POR_PAGINA, page * POR_PAGINA - 1);
    if (periodo !== "todos") consulta = consulta.gte("recibido_el", periodo === "hoy" ? inicioHoy : inicioSemana);
    const [lista, cuenta] = await Promise.all([consulta, porAtender().limit(1)]);
    fallo = lista.error?.message ?? null;
    filas = (lista.data ?? []).map((p) => ({ ...p, lineas: lineasDe(p.lineas) }));
    total = lista.count ?? 0;
    abiertos = cuenta.count ?? 0;
  }

  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const href = (v: Ver, per: Periodo = periodo, p = 1) => {
    if (v === "atender") return "/cafeteria/pedidos";
    const q = new URLSearchParams({ ver: "historial" });
    if (per !== "hoy") q.set("periodo", per);
    if (p > 1) q.set("page", String(p));
    return `/cafeteria/pedidos?${q}`;
  };
  const aqui = href(ver, periodo, page);

  // El aviso de lo que se acaba de hacer: se lee el pedido para decir en qué quedó de verdad.
  const hechoId = Number(sp.hecho);
  let aviso: { id: number; nombre: string; estado: string; antes: string | null } | null = null;
  if (Number.isInteger(hechoId) && hechoId > 0) {
    const { data } = await supabase.from("cafeteria_pedidos").select("id, nombre, estado").eq("id", hechoId).maybeSingle();
    if (data) aviso = { id: data.id, nombre: data.nombre, estado: data.estado, antes: esEstado(sp.antes) && sp.antes !== data.estado ? sp.antes : null };
  }

  return (
    <div className="space-y-6">
      <AlDia aviso={aviso ? `${aviso.id}-${aviso.estado}` : sp.error ? "error" : null} />

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="cdaf-headline">Cafetería</h1>
          <p className="text-muted-foreground max-w-2xl text-sm">
            Los pedidos que se armaron en la carta y se mandaron a WhatsApp.
          </p>
        </div>
        <dl className="flex items-baseline gap-2 text-sm">
          <dd className="font-heading text-2xl font-semibold tabular-nums">{abiertos}</dd>
          <dt className="text-muted-foreground">por atender hoy</dt>
        </dl>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Pestanas activa="pedidos" />
        <nav aria-label="Lista" className="bg-muted inline-flex rounded-lg p-1">
          {([
            { id: "atender", nombre: "Por atender" },
            { id: "historial", nombre: "Historial" },
          ] as const).map((v) => (
            <Link
              key={v.id}
              href={href(v.id, "hoy")}
              aria-current={v.id === ver ? "page" : undefined}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                v.id === ver ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {v.nombre}
              {v.id === "atender" && abiertos > 0 && (
                <span className="bg-stadium text-primary font-heading rounded-full px-1.5 text-[10px] leading-4 font-bold tabular-nums">{abiertos}</span>
              )}
            </Link>
          ))}
        </nav>
      </div>

      {sp.error && (
        <p role="alert" className="bg-destructive/10 text-destructive rounded-lg px-4 py-3 text-sm">
          No se pudo cambiar el estado del pedido. Recarga la página y vuelve a intentar.
        </p>
      )}

      {aviso && (
        <div role="status" className="bg-stadium flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg px-4 py-3 text-sm text-white">
          <p>
            El pedido de <strong>{aviso.nombre}</strong> quedó como <strong className="text-primary">{nombreEstado(aviso.estado)}</strong>.
            {!sigueAbierto(aviso.estado) && " Pasó al historial."}
          </p>
          {aviso.antes && (
            <form action={cambiarEstadoPedido}>
              <input type="hidden" name="id" value={aviso.id} />
              <input type="hidden" name="estado" value={aviso.antes} />
              <input type="hidden" name="deshacer" value="1" />
              <input type="hidden" name="volver" value={aqui} />
              <button type="submit" className="text-primary font-bold underline-offset-2 hover:underline">Deshacer</button>
            </form>
          )}
        </div>
      )}

      {ver === "historial" && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-muted-foreground text-sm">
            Lo entregado, lo cancelado y todo lo de días anteriores.{" "}
            <span className="tabular-nums">{total} {total === 1 ? "pedido" : "pedidos"}.</span>
          </p>
          <nav aria-label="Periodo" className="bg-muted inline-flex rounded-lg p-1">
            {PERIODOS.map((p) => (
              <Link
                key={p.id}
                href={href("historial", p.id)}
                aria-current={p.id === periodo ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                  p.id === periodo ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {p.nombre}
              </Link>
            ))}
          </nav>
        </div>
      )}

      <p className="text-muted-foreground text-xs">
        Un pedido queda aquí cuando la persona toca «Enviar pedido por WhatsApp». Si después no lo envió dentro de WhatsApp, a la cafetería no le llegó: el chat de WhatsApp sigue siendo el que manda.
        {" "}Esta pantalla se actualiza sola cada {SEGUNDOS_ENTRE_REFRESCOS} segundos.
      </p>

      {fallo ? (
        <p className="bg-destructive/10 text-destructive rounded-lg px-4 py-3 text-sm">
          No se pudieron cargar los pedidos ({fallo}). Recarga la página.
        </p>
      ) : filas.length === 0 ? (
        <EmptyState
          icon={ReceiptText}
          title={ver === "atender" ? "No hay pedidos por atender" : "No hay pedidos en este periodo"}
          description={
            ver === "atender"
              ? "Los pedidos de hoy aparecen aquí solos, apenas alguien los arma desde la carta."
              : "Aquí queda lo entregado, lo cancelado y lo de días anteriores."
          }
          className="bg-card rounded-xl shadow-sm ring-1 ring-foreground/[0.06]"
        />
      ) : (
        <ul className="m-0 grid list-none gap-3 p-0 xl:grid-cols-2">
          {filas.map((p) => (
            <TarjetaPedido key={p.id} pedido={p} porAtender={ver === "atender"} volverA={aqui} />
          ))}
        </ul>
      )}

      {ver === "atender" && total > filas.length && (
        <p className="text-muted-foreground text-xs">Se muestran los {filas.length} más antiguos de {total} por atender.</p>
      )}

      {ver === "historial" && paginas > 1 && (
        <div className="flex items-center justify-between gap-3">
          {page > 1 ? (
            <Link href={href("historial", periodo, page - 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>← Anterior</Link>
          ) : (
            <span className={`${buttonVariants({ variant: "outline", size: "sm" })} pointer-events-none opacity-40`}>← Anterior</span>
          )}
          <span className="text-muted-foreground text-sm tabular-nums">Página {page} de {paginas}</span>
          {page < paginas ? (
            <Link href={href("historial", periodo, page + 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>Siguiente →</Link>
          ) : (
            <span className={`${buttonVariants({ variant: "outline", size: "sm" })} pointer-events-none opacity-40`}>Siguiente →</span>
          )}
        </div>
      )}
    </div>
  );
}
