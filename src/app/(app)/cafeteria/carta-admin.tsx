"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Check, Pencil, Search, UtensilsCrossed, X } from "lucide-react";
import { Interruptor } from "./interruptor";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import type { CategoriaAdmin, ProductoAdmin } from "@/lib/cafeteria/carta";
import { pesos } from "@/lib/cafeteria/pedido";
import { cn } from "@/lib/utils";

type Filtro = "todos" | "disponibles" | "no_disponibles";
const FILTROS: { id: Filtro; nombre: string }[] = [
  { id: "todos", nombre: "Todos" },
  { id: "disponibles", nombre: "Disponibles" },
  { id: "no_disponibles", nombre: "No disponibles" },
];

/** Lo que se acaba de hacer en el editor, para decirlo al volver a la rejilla. */
export type AvisoCarta = { texto: string; productoId: number | null };

/** Para buscar "cafe" y encontrar "Café". */
const plano = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * La carta tal como la ve quien la administra: el buscador con su filtro y,
 * debajo, los productos en tarjetas con foto agrupados por categoría. La
 * categoría la escoge la columna de la izquierda (llega ya filtrada en
 * `categorias`); aquí se busca por nombre y se filtra por disponibilidad.
 */
export function CartaAdmin({
  categorias,
  productos,
  puedeEditar,
  categoriaActiva,
  aviso,
}: {
  /** Las categorías a pintar: todas, o solo la escogida en la columna. */
  categorias: CategoriaAdmin[];
  productos: ProductoAdmin[];
  puedeEditar: boolean;
  /** La categoría escogida en la columna (`null` = Todas): el lápiz la lleva al editor para saber a dónde volver. */
  categoriaActiva: number | null;
  /** Al volver del editor: qué se guardó, creó o eliminó. */
  aviso?: AvisoCarta | null;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [avisoVisible, setAvisoVisible] = useState(true);
  const resaltado = aviso && avisoVisible ? aviso.productoId : null;

  // Al volver del editor: se trae a la vista la tarjeta del producto y se limpia
  // la dirección, para que recargar o volver atrás no repita el aviso.
  useEffect(() => {
    if (!aviso) return;
    if (aviso.productoId) document.getElementById(`producto-${aviso.productoId}`)?.scrollIntoView({ block: "center" });
    const url = new URL(window.location.href);
    for (const clave of ["hecho", "p", "n", "nota"]) url.searchParams.delete(clave);
    window.history.replaceState(null, "", url);
  }, [aviso]);

  const visibles = useMemo(() => {
    const q = plano(busqueda.trim());
    const ids = new Set(categorias.map((c) => c.id));
    return productos.filter((p) => {
      if (!ids.has(p.categoriaId)) return false;
      if (filtro === "disponibles" && !p.disponible) return false;
      if (filtro === "no_disponibles" && p.disponible) return false;
      return !q || plano(p.nombre).includes(q);
    });
  }, [productos, categorias, busqueda, filtro]);

  const filtrando = busqueda.trim() !== "" || filtro !== "todos";

  return (
    <div className="space-y-6">
      {aviso && avisoVisible && (
        <div role="status" className="bg-stadium flex items-center gap-3 rounded-xl py-2.5 pr-2 pl-4 text-sm font-semibold text-white shadow-sm">
          <span className="bg-primary text-stadium flex size-6 shrink-0 items-center justify-center rounded-full">
            <Check className="size-4" strokeWidth={3} />
          </span>
          <span className="min-w-0 flex-1">{aviso.texto}</span>
          <button type="button" aria-label="Cerrar el aviso" onClick={() => setAvisoVisible(false)} className="flex size-9 shrink-0 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white">
            <X className="size-4" />
          </button>
        </div>
      )}

      <div className="bg-card flex flex-wrap items-center gap-3 rounded-xl p-3.5 shadow-sm ring-1 ring-foreground/[0.06]">
        <div className="relative min-w-[200px] flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-3.5 left-3.5 size-4" />
          <Input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar un producto"
            aria-label="Buscar un producto"
            className="h-11 pl-10"
          />
        </div>
        <div role="group" aria-label="Filtrar por disponibilidad" className="bg-muted flex rounded-lg p-1">
          {FILTROS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filtro === f.id}
              onClick={() => setFiltro(f.id)}
              className={cn(
                "h-9 rounded-md px-3 text-xs font-semibold transition-colors",
                filtro === f.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f.nombre}
            </button>
          ))}
        </div>
      </div>

      {visibles.length === 0 && (
        <EmptyState
          icon={UtensilsCrossed}
          title={filtrando ? "Ningún producto coincide" : "Aquí todavía no hay productos"}
          description={filtrando ? "Prueba con otra palabra o quita el filtro." : "Agrega el primero con el botón «Nuevo producto»."}
          className="bg-card rounded-xl shadow-sm ring-1 ring-foreground/[0.06]"
        />
      )}

      {categorias.map((c) => {
        const items = visibles.filter((p) => p.categoriaId === c.id);
        if (items.length === 0) return null;
        const disponibles = items.filter((p) => p.disponible).length;
        return (
          <section key={c.id} className="space-y-3">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="font-heading text-base font-bold uppercase">{c.nombre}</h2>
              <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                {disponibles} de {items.length} disponibles
              </span>
            </div>
            <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(152px,1fr))] gap-3.5 p-0">
              {items.map((p) => (
                <ProductoTarjeta key={p.id} producto={p} puedeEditar={puedeEditar} de={categoriaActiva} resaltada={p.id === resaltado} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/**
 * Un producto de la carta: foto, nombre, precio, el lápiz que abre su editor y,
 * al pie, el interruptor. Apagado se ve en gris, con borde punteado y la etiqueta
 * "No disponible", para que salte a la vista entre los demás.
 */
export function ProductoTarjeta({
  producto: p,
  puedeEditar,
  de = null,
  resaltada = false,
}: {
  producto: ProductoAdmin;
  puedeEditar: boolean;
  /** La categoría escogida en la columna (`null` = Todas), para que el editor sepa a dónde volver. */
  de?: number | null;
  /** El producto que se acaba de guardar o crear. */
  resaltada?: boolean;
}) {
  const sinPrecio = p.precio <= 0;
  return (
    <li
      id={`producto-${p.id}`}
      className={cn(
        "flex scroll-mt-24 flex-col overflow-hidden rounded-xl",
        resaltada && "outline-stadium outline-2 outline-offset-2",
        p.disponible
          ? "bg-card shadow-sm ring-1 ring-foreground/[0.06]"
          : "bg-muted/50 [outline:1.5px_dashed_var(--color-border)] outline-offset-[-1.5px]",
      )}
    >
      <div className={cn("text-muted-foreground relative m-2 mb-0 flex h-[118px] items-center justify-center rounded-lg", p.disponible ? "bg-muted/60" : "bg-muted")}>
        {p.fotoUrl ? (
          <Image src={p.fotoUrl} alt="" fill sizes="200px" className={cn("object-contain p-2.5", !p.disponible && "opacity-50 grayscale")} />
        ) : (
          <UtensilsCrossed className="size-6" aria-label="Sin foto" />
        )}
        {!p.disponible && (
          <span className="bg-stadium absolute top-2 left-2 rounded-full px-2 py-0.5 text-[11px] font-bold text-white">No disponible</span>
        )}
      </div>

      <div className="pt-2.5 pr-1 pb-0.5 pl-3">
        <h3 className={cn("min-h-9 text-[13px] leading-snug font-semibold", !p.disponible && "text-muted-foreground")}>
          {p.nombre}
          {p.opciones.length > 0 && <span className="text-muted-foreground block text-[11px] font-normal">{p.opciones.join(" · ")}</span>}
        </h3>
        <div className="flex min-h-11 items-center justify-between gap-1">
          {sinPrecio ? (
            <Badge variant="warning">Sin precio</Badge>
          ) : (
            <span className={cn("font-heading text-base font-bold tabular-nums", !p.disponible && "text-muted-foreground")}>{pesos(p.precio)}</span>
          )}
          {puedeEditar && (
            <Link
              href={`/cafeteria/producto/${p.id}${de ? `?de=${de}` : ""}`}
              aria-label={`Editar ${p.nombre}`}
              className="text-muted-foreground hover:bg-muted hover:text-foreground flex size-11 shrink-0 items-center justify-center rounded-lg"
            >
              <Pencil className="size-4" />
            </Link>
          )}
        </div>
      </div>

      <Interruptor productoId={p.id} nombre={p.nombre} disponible={p.disponible} sinPrecio={sinPrecio} puedeEditar={puedeEditar} />
    </li>
  );
}
