"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { UtensilsCrossed } from "lucide-react";
import { IconoFruta } from "@/app/carta/icono-fruta";
import { pesos } from "@/lib/cafeteria/pedido";
import { cn } from "@/lib/utils";

export type ItemVista = {
  clave: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  opciones: string[];
  fotoUrl: string | null;
  /** El producto que se está editando: va resaltado. */
  actual: boolean;
};

/**
 * "Así lo ve el comprador": un celular con la carta pública en la sección de la
 * categoría del producto que se está editando, con ese producto resaltado y
 * cambiando en vivo mientras se escribe. Es un dibujo de la carta (`/carta`), no
 * la carta misma: nada aquí se puede tocar, por eso los "+" no son botones.
 *
 * Si el producto está como no disponible (o sin precio) no aparece en la lista,
 * igual que le pasa al comprador, y `motivoOculto` dice por qué.
 */
export function VistaComprador({
  categoria,
  items,
  motivoOculto,
}: {
  categoria: string;
  items: ItemVista[];
  motivoOculto: string | null;
}) {
  const pantalla = useRef<HTMLDivElement>(null);
  const fila = useRef<HTMLDivElement>(null);
  // Si alguno tiene foto, los demás llevan un recuadro vacío para que los nombres
  // queden alineados; si ninguno tiene, la lista va sin recuadros (como en /carta).
  const conFotos = items.some((i) => i.fotoUrl);
  const posicion = items.findIndex((i) => i.actual);

  // Trae a la vista el producto resaltado. Se mueve solo el scroll del celular
  // (no `scrollIntoView`, que también movería la página entera).
  useEffect(() => {
    if (pantalla.current && fila.current) {
      pantalla.current.scrollTop = Math.max(0, fila.current.offsetTop - 150);
    }
  }, [posicion, categoria]);

  return (
    <div className="mx-auto flex w-[290px] shrink-0 flex-col items-center gap-3 xl:mx-0">
      <p className="text-muted-foreground text-[10px] font-bold tracking-[0.12em] uppercase">Así lo ve el comprador</p>
      <div
        role="img"
        aria-label={`Vista previa de la carta en un celular, en la categoría ${categoria}`}
        className="border-stadium bg-background h-[640px] w-full overflow-hidden rounded-[40px] border-[9px]"
      >
        <div ref={pantalla} className="relative h-full space-y-2.5 overflow-y-auto px-[11px] py-3.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex items-center gap-2.5 px-0.5">
            <Image src="/registro-logo.jpg" alt="" width={30} height={30} className="size-[30px] rounded-lg object-cover" />
            <div>
              <p className="text-[7px] font-bold tracking-[0.16em] text-[#46530a]">CENTRO DEPORTIVO ALEJANDRO FALLA</p>
              <p className="font-heading text-[15px] leading-tight font-extrabold uppercase italic">Cafetería</p>
            </div>
          </div>

          <p className="font-heading px-0.5 pt-1.5 text-[13px] font-extrabold uppercase italic">{categoria}</p>

          {items.length === 0 ? (
            <p className="bg-card text-muted-foreground rounded-xl px-3 py-4 text-center text-[11px] shadow-xs">
              Esta categoría no tiene nada disponible: el comprador no la ve.
            </p>
          ) : (
            <div className="bg-card divide-y divide-[#eef1f2] overflow-hidden rounded-xl shadow-xs">
              {items.map((i) => (
                <div key={i.clave} ref={i.actual ? fila : undefined} className={cn("px-[11px] py-[9px]", i.actual && "bg-primary/15 ring-primary ring-2 ring-inset")}>
                  <div className="flex items-center gap-[9px]">
                    {conFotos && <FotoMini url={i.fotoUrl} />}
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-xs leading-snug", i.actual ? "font-bold" : "font-semibold")}>{i.nombre || "Nombre del producto"}</p>
                      {i.descripcion && <p className="text-muted-foreground text-[10.5px] leading-snug">{i.descripcion}</p>}
                      <p className="font-heading text-charcoal text-[11px] font-bold tabular-nums">{pesos(i.precio)}</p>
                    </div>
                    {i.opciones.length === 0 ? (
                      <Mas />
                    ) : (
                      // En la carta las opciones llegan plegadas tras este botón; aquí se muestran abiertas.
                      <span aria-hidden className="bg-primary text-stadium shrink-0 rounded-full px-2.5 py-1.5 text-[10px] leading-none font-bold">Elegir</span>
                    )}
                  </div>
                  {i.opciones.map((o) => (
                    <div key={o} className={cn("flex items-center gap-[9px] pt-1.5 text-[11px]", !conFotos && "pl-3")}>
                      {conFotos && (
                        <span className="flex w-10 shrink-0 justify-center">
                          <IconoFruta opcion={o} className="size-6" />
                        </span>
                      )}
                      <span className="min-w-0 flex-1">{o}</span>
                      <Mas />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {motivoOculto && <p className="max-w-[260px] text-center text-xs text-[#8a5600]">{motivoOculto}</p>}
    </div>
  );
}

function Mas() {
  return (
    <span aria-hidden className="bg-primary text-stadium flex size-7 shrink-0 items-center justify-center rounded-full text-base leading-none font-bold">
      +
    </span>
  );
}

/** La foto en la lista del celular. Una foto recién escogida (blob:) no pasa por el optimizador. */
function FotoMini({ url }: { url: string | null }) {
  if (!url) {
    return (
      <span className="bg-muted text-muted-foreground/60 flex size-10 shrink-0 items-center justify-center rounded-lg">
        <UtensilsCrossed className="size-4" />
      </span>
    );
  }
  return (
    <span className="relative size-10 shrink-0 overflow-hidden rounded-lg border border-[#e9edef] bg-white">
      {url.startsWith("blob:") ? (
        // eslint-disable-next-line @next/next/no-img-element -- vista previa local de la foto recién escogida
        <img src={url} alt="" className="size-full object-contain p-0.5" />
      ) : (
        <Image src={url} alt="" fill sizes="40px" className="object-contain p-0.5" />
      )}
    </span>
  );
}
