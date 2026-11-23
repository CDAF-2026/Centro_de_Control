import Link from "next/link";
import { ExternalLink, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button";
import { PUEDE_CAMBIAR_WHATSAPP } from "@/lib/cafeteria/carta";
import { can } from "@/lib/auth/permissions";
import type { AppRole } from "@/lib/database.types";
import { cn } from "@/lib/utils";
import { CategoriasRail } from "./categorias";
import type { PanelCafeteria } from "./datos";
import { Pestanas } from "./pestanas";
import { WhatsappForm } from "./whatsapp-form";

/**
 * El marco que comparten las tres pantallas de la carta (la rejilla, crear y
 * editar): arriba el título con los botones y el marcador de cifras; a la
 * izquierda las pestañas, las categorías y el WhatsApp; a la derecha lo que
 * ponga cada pantalla. Diseño "mezcla" escogido por Laura el 20-nov-2026.
 *
 * En celular la columna izquierda se deshace (`contents`) y sus piezas se
 * intercalan con el contenido: pestañas → categorías (en fila, deslizables) →
 * contenido → WhatsApp. Así el WhatsApp, que casi nunca se toca, no queda
 * estorbando antes de los productos.
 */
export function Marco({
  panel,
  rol,
  categoriaActiva,
  children,
}: {
  panel: PanelCafeteria;
  rol: AppRole;
  /** La categoría escogida en la columna; `null` = Todas. */
  categoriaActiva: number | null;
  children: ReactNode;
}) {
  const puedeEditar = can(rol, "cafeteria", "edit");
  const { cifras } = panel;
  const nuevoHref = categoriaActiva ? `/cafeteria/producto/nuevo?categoria=${categoriaActiva}` : "/cafeteria/producto/nuevo";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <h1 className="cdaf-headline">Cafetería</h1>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:items-end">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:justify-end">
            <Link href="/carta" target="_blank" className={cn(buttonVariants({ variant: "outline" }), "h-11 px-4 font-semibold")}>
              Ver como comprador <ExternalLink className="size-4" />
            </Link>
            {puedeEditar && (
              <Link href={nuevoHref} className={cn(buttonVariants(), "h-11 px-4 font-bold")}>
                <Plus className="size-4" strokeWidth={2.6} /> Nuevo producto
              </Link>
            )}
          </div>
          <dl className="bg-border grid grid-cols-2 gap-px overflow-hidden rounded-xl shadow-sm ring-1 ring-foreground/[0.06] sm:flex">
            <Cifra etiqueta="Productos" valor={cifras.total} />
            <Cifra etiqueta="Disponibles" valor={cifras.disponibles} />
            <Cifra etiqueta="No disponibles" valor={cifras.noDisponibles} aviso={cifras.noDisponibles > 0} />
            <Cifra etiqueta="Sin foto" valor={cifras.sinFoto} />
          </dl>
        </div>
      </header>

      {panel.error && (
        <p className="bg-destructive/10 text-destructive rounded-lg px-4 py-3 text-sm">
          No se pudo cargar la carta ({panel.error}). Recarga la página; si sigue igual, avisa a quien administra la plataforma.
        </p>
      )}
      {!panel.error && !panel.whatsapp && (
        <p className="rounded-lg bg-[#f2b53d]/15 px-4 py-3 text-sm text-[#8a5600]">
          Falta el WhatsApp de la cafetería: mientras no esté, al enviar un pedido WhatsApp deja escoger el contacto en vez de abrir el chat de la cafetería.
        </p>
      )}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
        <div className="contents lg:sticky lg:top-20 lg:-m-1 lg:flex lg:max-h-[calc(100vh-6rem)] lg:w-[248px] lg:shrink-0 lg:flex-col lg:gap-4 lg:overflow-y-auto lg:p-1">
          <div className="order-1">
            <Pestanas activa="carta" />
          </div>
          <div className="order-2">
            <CategoriasRail
              categorias={panel.categorias}
              conteo={panel.conteo}
              total={cifras.total}
              activa={categoriaActiva}
              puedeEditar={puedeEditar}
            />
          </div>
          <div className="order-4">
            <WhatsappForm whatsapp={panel.whatsapp} puedeCambiar={PUEDE_CAMBIAR_WHATSAPP.includes(rol)} />
          </div>
        </div>
        <div className="order-3 min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}

function Cifra({ etiqueta, valor, aviso }: { etiqueta: string; valor: number; aviso?: boolean }) {
  return (
    <div className="bg-card px-5 py-2.5">
      <dt className="text-muted-foreground text-[10px] font-bold tracking-[0.1em] uppercase">{etiqueta}</dt>
      <dd className={cn("font-heading text-[22px] leading-tight font-bold tabular-nums", aviso && "text-[#8a5600]")}>{valor}</dd>
    </div>
  );
}
