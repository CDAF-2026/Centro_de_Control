import Image from "next/image";
import Link from "next/link";

/**
 * Cabecera compacta de las pantallas interiores del registro (consentimiento,
 * listo, datos): logo lima + nombre del club. La landing no la usa: ahí va la
 * foto con el logo montado encima. `children` es el contenido de la tarjeta.
 */
export function Cabecera({ titulo, children }: { titulo: string; children: React.ReactNode }) {
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
      <div className="bg-card rounded-2xl p-5 shadow-xl ring-1 ring-white/5 md:p-7">{children}</div>
    </div>
  );
}
