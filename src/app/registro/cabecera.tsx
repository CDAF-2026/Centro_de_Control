import Image from "next/image";
import Link from "next/link";

/**
 * Cabecera compacta de las pantallas interiores del registro sobre el fondo oscuro
 * (listo, en preparación, datos): logo lima + nombre del club. La landing no la usa:
 * ahí va la foto con el logo montado encima. `children` es el contenido de la tarjeta;
 * con `sinTarjeta` se entrega crudo (el formulario de datos pinta su propia barra de
 * pasos entre la cabecera y la tarjeta).
 */
export function Cabecera({ titulo, sinTarjeta, children }: { titulo: string; sinTarjeta?: boolean; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pt-6 md:max-w-lg md:px-6">
      <Link href="/registro" className="mb-5 flex items-center gap-3">
        <span className="size-12 shrink-0 overflow-hidden rounded-xl bg-primary shadow-lg shadow-black/40">
          <Image src="/registro-logo.jpg" alt="Centro Deportivo Alejandro Falla" width={48} height={48} className="size-full object-cover" priority />
        </span>
        <span className="flex flex-col">
          <span className="text-primary text-[10px] font-bold uppercase tracking-[0.18em]">Centro Deportivo Alejandro Falla</span>
          <span className="font-heading text-lg font-extrabold uppercase italic leading-none text-white">{titulo}</span>
        </span>
      </Link>
      {sinTarjeta ? children : <div className="bg-card rounded-2xl p-5 shadow-xl ring-1 ring-white/5 md:p-7">{children}</div>}
    </div>
  );
}

/**
 * Cabecera de las pantallas CLARAS (el consentimiento, diseño C "Resumen primero"):
 * franja blanca con el logo y el título, y debajo las tarjetas sueltas sobre el fondo
 * claro. `data-tema="claro"` es lo que lee el layout para cambiar el fondo de la página.
 */
export function CabeceraClara({ titulo, subtitulo, children }: { titulo: string; subtitulo: string; children: React.ReactNode }) {
  return (
    <div data-tema="claro" className="mx-auto flex w-full max-w-md flex-1 flex-col md:max-w-lg">
      <Link href="/registro" className="bg-card flex items-center gap-3 px-5 py-3.5 shadow-[0_1px_0_rgba(26,28,30,0.08)] md:mt-4 md:rounded-2xl md:shadow-sm">
        <span className="size-9 shrink-0 overflow-hidden rounded-[9px] bg-primary">
          <Image src="/registro-logo.jpg" alt="Centro Deportivo Alejandro Falla" width={36} height={36} className="size-full object-cover" priority />
        </span>
        <span className="flex flex-col gap-px">
          <span className="font-heading text-[15px] font-extrabold uppercase italic leading-tight">{titulo}</span>
          <span className="text-muted-foreground text-[11px]">{subtitulo}</span>
        </span>
      </Link>
      <div className="flex flex-col gap-3 px-4 pt-4 md:px-0">{children}</div>
    </div>
  );
}
