"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import {
  crearCategoria,
  eliminarCategoria,
  moverCategoria,
  renombrarCategoria,
  type CafeteriaState,
} from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CategoriaAdmin } from "@/lib/cafeteria/carta";
import { cn } from "@/lib/utils";

const inicial: CafeteriaState = {};

/**
 * La columna de categorías. Tiene dos caras:
 *  · normal — cada categoría es un enlace que filtra la carta (`?categoria=`),
 *    en el orden en que las ve el comprador. En celular va en una fila deslizable.
 *  · "Editar" — subir o bajar, renombrar (lápiz) y eliminar (caneca).
 * Van separadas a propósito: mientras se vende, un toque en una categoría solo
 * debe filtrar; mover o borrar pide entrar primero a editar.
 *
 * Eliminar (Laura, 20-nov-2026) vale para cualquier categoría: si tiene
 * productos, se escoge a cuál otra pasan. Los productos nunca se borran de paso.
 * El formulario de eliminar vive AQUÍ y no en cada fila: la fila desaparece al
 * eliminarse, y con ella se iría el mensaje de lo que se hizo.
 */
export function CategoriasRail({
  categorias,
  conteo,
  total,
  activa,
  puedeEditar,
}: {
  categorias: CategoriaAdmin[];
  /** Cuántos productos tiene cada categoría (id → número). */
  conteo: Record<number, number>;
  total: number;
  /** La categoría escogida; `null` = Todas. */
  activa: number | null;
  puedeEditar: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const [agregando, setAgregando] = useState(false);
  const [estado, crear, creando] = useActionState(crearCategoria, inicial);
  const [borrado, eliminar, eliminando] = useActionState(eliminarCategoria, inicial);

  return (
    <div className="bg-card space-y-2 rounded-xl p-2.5 shadow-sm ring-1 ring-foreground/[0.06]">
      <div className="flex items-center justify-between pr-0.5 pl-2">
        <h2 className="font-heading text-xs font-bold tracking-[0.08em] uppercase">Categorías</h2>
        {puedeEditar && (
          <button
            type="button"
            aria-pressed={editando}
            onClick={() => setEditando((e) => !e)}
            className="h-8 rounded-md px-2 text-xs font-semibold text-[#46530a] hover:bg-muted"
          >
            {editando ? "Listo" : "Editar"}
          </button>
        )}
      </div>

      {editando ? (
        <ul className="m-0 list-none space-y-1 p-0">
          {categorias.map((c, i) => (
            <CategoriaFila
              key={c.id}
              categoria={c}
              productos={conteo[c.id] ?? 0}
              otras={categorias.filter((o) => o.id !== c.id)}
              primera={i === 0}
              ultima={i === categorias.length - 1}
              eliminar={eliminar}
              eliminando={eliminando}
            />
          ))}
        </ul>
      ) : (
        <nav aria-label="Categorías" className="flex gap-1 overflow-x-auto [scrollbar-width:none] lg:flex-col lg:overflow-visible [&::-webkit-scrollbar]:hidden">
          <EnlaceCategoria href="/cafeteria" nombre="Todas" cantidad={total} activa={activa === null} />
          {categorias.map((c) => (
            <EnlaceCategoria key={c.id} href={`/cafeteria?categoria=${c.id}`} nombre={c.nombre} cantidad={conteo[c.id] ?? 0} activa={activa === c.id} />
          ))}
        </nav>
      )}

      {borrado.ok && <p role="status" className="bg-primary/20 rounded-lg px-3 py-2 text-xs font-medium text-[#46530a]">{borrado.ok}</p>}
      {borrado.error && <p role="alert" className="bg-destructive/10 text-destructive rounded-lg px-3 py-2 text-xs">{borrado.error}</p>}

      {puedeEditar &&
        (agregando ? (
          <form action={crear} className="space-y-1.5 px-0.5 pt-1">
            <div className="flex gap-1.5">
              <Input name="nombre" aria-label="Nombre de la categoría nueva" placeholder="Ej.: Desayunos" maxLength={40} required autoFocus className="h-9 text-sm" />
              <Button type="submit" size="sm" className="h-9" disabled={creando}>{creando ? "…" : "Agregar"}</Button>
            </div>
            {estado.error && <p className="text-destructive text-xs">{estado.fieldErrors?.nombre ?? estado.error}</p>}
            {estado.ok && <p className="text-xs font-medium text-[#46530a]">{estado.ok}</p>}
            <button type="button" onClick={() => setAgregando(false)} className="text-muted-foreground text-xs font-semibold hover:underline">Cerrar</button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setAgregando(true)}
            className="text-muted-foreground hover:text-foreground flex h-11 w-full items-center justify-center gap-1.5 rounded-lg border-[1.5px] border-dashed text-[13px] font-semibold"
          >
            <Plus className="size-3.5" strokeWidth={2.6} /> Nueva categoría
          </button>
        ))}
    </div>
  );
}

function EnlaceCategoria({ href, nombre, cantidad, activa }: { href: string; nombre: string; cantidad: number; activa: boolean }) {
  return (
    <Link
      href={href}
      aria-current={activa ? "page" : undefined}
      className={cn(
        "flex h-10 shrink-0 items-center justify-between gap-3 rounded-lg px-3 text-[13px] whitespace-nowrap transition-colors lg:whitespace-normal",
        activa ? "bg-stadium font-bold text-white" : "hover:bg-muted font-semibold",
      )}
    >
      <span className="leading-tight">{nombre}</span>
      <span className={cn("tabular-nums", activa ? "text-primary" : "text-muted-foreground")}>{cantidad}</span>
    </Link>
  );
}

/**
 * Una categoría en modo "Editar": subir, bajar, renombrar y eliminar.
 *
 * Eliminar pide confirmar en la misma fila. Con productos adentro hay que
 * escoger primero a qué otra categoría pasan; si es la única que hay, no se
 * puede (no habría a dónde pasarlos) y se dice.
 */
export function CategoriaFila({
  categoria: c,
  productos,
  otras,
  primera,
  ultima,
  eliminar,
  eliminando,
}: {
  categoria: CategoriaAdmin;
  productos: number;
  /** Las demás categorías: a dónde pueden pasar sus productos. */
  otras: CategoriaAdmin[];
  primera: boolean;
  ultima: boolean;
  /** La acción de eliminar, que vive en la columna (ver `CategoriasRail`). */
  eliminar: (formData: FormData) => void;
  eliminando: boolean;
}) {
  const [panel, setPanel] = useState<"renombrar" | "eliminar" | null>(null);
  const [guardado, renombrar, guardando] = useActionState(renombrarCategoria, inicial);
  const [moviendo, iniciar] = useTransition();
  const [errorMover, setErrorMover] = useState<string | null>(null);

  const mover = (direccion: "subir" | "bajar") =>
    iniciar(async () => {
      const r = await moverCategoria(c.id, direccion);
      setErrorMover(r.error ?? null);
    });

  if (panel === "renombrar") {
    return (
      <li className="bg-muted/50 space-y-2 rounded-lg p-2">
        <form action={renombrar} className="flex gap-1.5">
          <input type="hidden" name="id" value={c.id} />
          <Input name="nombre" defaultValue={c.nombre} aria-label="Nombre de la categoría" maxLength={40} required autoFocus className="h-9 text-sm" />
          <Button type="submit" size="sm" className="h-9" disabled={guardando}>{guardando ? "…" : "Guardar"}</Button>
        </form>
        <div className="flex items-center gap-2">
          {guardado.error && <p className="text-destructive text-xs">{guardado.fieldErrors?.nombre ?? guardado.error}</p>}
          {guardado.ok && <p className="text-xs font-medium text-[#46530a]">{guardado.ok}</p>}
          <Button type="button" size="xs" variant="ghost" className="ml-auto" onClick={() => setPanel(null)}>Cerrar</Button>
        </div>
      </li>
    );
  }

  if (panel === "eliminar") {
    const sinDestino = productos > 0 && otras.length === 0;
    return (
      <li className="bg-destructive/[0.06] space-y-2 rounded-lg p-2.5">
        <p className="text-[13px] leading-snug font-semibold">¿Eliminar «{c.nombre}»?</p>
        {sinDestino ? (
          <>
            <p className="text-muted-foreground text-xs leading-snug">
              Tiene {productos} {productos === 1 ? "producto" : "productos"} y es la única categoría: crea otra para pasarlos allá, o elimínalos primero.
            </p>
            <Button type="button" size="xs" variant="ghost" onClick={() => setPanel(null)}>Cerrar</Button>
          </>
        ) : (
          <form action={eliminar} className="space-y-2">
            <input type="hidden" name="id" value={c.id} />
            {productos > 0 ? (
              <label className="block space-y-1 text-xs leading-snug">
                <span className="text-muted-foreground">
                  Tiene {productos} {productos === 1 ? "producto" : "productos"}. No se borran: ¿a qué categoría {productos === 1 ? "pasa" : "pasan"}?
                </span>
                <select name="destino" required defaultValue="" className="border-input bg-background h-9 w-full rounded-md border px-2 text-[13px]">
                  <option value="" disabled>Escoge una categoría</option>
                  {otras.map((o) => (
                    <option key={o.id} value={o.id}>{o.nombre}</option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="text-muted-foreground text-xs">Está vacía: no tiene productos.</p>
            )}
            <div className="flex flex-wrap gap-1.5">
              <Button type="submit" size="sm" variant="destructive" className="h-9" disabled={eliminando}>
                {eliminando ? "Eliminando…" : productos > 0 ? "Pasar y eliminar" : "Eliminar"}
              </Button>
              <Button type="button" size="sm" variant="ghost" className="h-9" onClick={() => setPanel(null)}>Cancelar</Button>
            </div>
          </form>
        )}
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-center gap-0.5 rounded-lg py-0.5 pl-3">
      {/* El nombre parte en dos renglones en vez de cortarse: con cuatro botones al lado queda poco ancho. */}
      <span className="min-w-0 flex-1 text-[13px] leading-tight font-semibold">{c.nombre}</span>
      <Button type="button" size="icon-sm" variant="ghost" aria-label={`Subir ${c.nombre}`} disabled={primera || moviendo} onClick={() => mover("subir")}>
        <ArrowUp className="size-4" />
      </Button>
      <Button type="button" size="icon-sm" variant="ghost" aria-label={`Bajar ${c.nombre}`} disabled={ultima || moviendo} onClick={() => mover("bajar")}>
        <ArrowDown className="size-4" />
      </Button>
      <Button type="button" size="icon-sm" variant="ghost" aria-label={`Renombrar ${c.nombre}`} onClick={() => setPanel("renombrar")}>
        <Pencil className="size-3.5" />
      </Button>
      <Button type="button" size="icon-sm" variant="ghost" aria-label={`Eliminar ${c.nombre}`} className="text-destructive hover:text-destructive" onClick={() => setPanel("eliminar")}>
        <Trash2 className="size-3.5" />
      </Button>
      {errorMover && <span className="text-destructive w-full text-xs">{errorMover}</span>}
    </li>
  );
}
