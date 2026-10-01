import Image from "next/image";
import Link from "next/link";
import { ChevronRight, ClipboardList, PenLine } from "lucide-react";
import { registroAbierto } from "@/lib/registro/version";
import { EnPreparacion } from "./en-preparacion";

/**
 * La landing del QR: dos caminos (R1). Diseño "A · Cancha": la foto de Alejandro
 * Falla en blanco y negro se funde con el fondo stadium y el logo lima queda
 * montado sobre su borde. Sin versión vigente del texto no hay nada que hacer aquí.
 */
export default async function RegistroPage() {
  const version = await registroAbierto();
  if (!version) return <EnPreparacion />;

  return (
    <div className="flex flex-1 flex-col">
      {/* La foto sale de la columna y ocupa TODO el ancho (en celular la columna ya es
          la pantalla; en computador evita el recorte con bordes duros). El logo vuelve a
          la columna centrada para quedar alineado con el texto de abajo. */}
      <div className="relative left-1/2 h-[300px] w-screen -translate-x-1/2 md:h-[340px]">
        <Image
          src="/registro-hero.jpg"
          alt="Alejandro Falla jugando pádel"
          fill
          priority
          sizes="100vw"
          className="object-cover object-[60%_20%] grayscale contrast-105"
        />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-stadium/10 via-stadium/35 to-stadium" />
        <div aria-hidden className="absolute inset-0 hidden bg-gradient-to-r from-stadium/60 via-transparent to-stadium/60 md:block" />
        <div className="absolute inset-x-0 -bottom-9 mx-auto w-full max-w-md px-6 md:-bottom-7 md:max-w-3xl">
          <div className="size-[88px] overflow-hidden rounded-[20px] bg-primary shadow-2xl shadow-black/50 md:size-[72px] md:rounded-2xl">
            <Image src="/registro-logo.jpg" alt="Centro Deportivo Alejandro Falla" width={88} height={88} className="size-full object-cover" priority />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 px-6 pt-14 md:gap-1.5 md:pt-11">
        <p className="cdaf-eyebrow text-primary">Centro Deportivo Alejandro Falla</p>
        <h1 className="font-heading text-[34px] font-extrabold uppercase italic leading-[1.05] text-white md:text-[32px]">Registro de deportistas</h1>
        <p className="mt-1 text-[15px] leading-relaxed text-[#c5cdc9] md:mt-0 md:text-sm">
          Toma menos de cinco minutos. Ten a la mano el documento del deportista y el del padre, madre o acudiente.
        </p>
      </div>

      {/* Celular: una opción debajo de la otra. Computador: las dos en paralelo (pedido de Laura). */}
      <div className="flex flex-col gap-3.5 px-6 pt-7 md:grid md:grid-cols-2 md:gap-4 md:pt-5">
        <Opcion
          href="/registro/datos"
          titulo="Actualizar o ingresar datos"
          detalle="Ficha del deportista, acudientes y facturación. Al final firmas el consentimiento."
          icono={<ClipboardList className="size-6" />}
        />
        <Opcion
          href="/registro/consentimiento"
          titulo="Firmar el consentimiento"
          detalle="Si los datos ya están al día, solo lee y firma con el dedo."
          icono={<PenLine className="size-6" />}
        />
      </div>

      {/* Celular: la nota baja al pie (mt-auto). Computador: pegada a las tarjetas y centrada,
          para no dejar un hueco entre las dos (Laura, 1-oct-2026). */}
      <p className="mt-auto px-6 pt-7 text-xs leading-relaxed text-[#8a9399] md:mt-0 md:pt-6 md:text-center">
        Si tienes más de un hijo en el club, el proceso se hace una vez por cada uno.
      </p>
    </div>
  );
}

function Opcion({ href, titulo, detalle, icono }: { href: string; titulo: string; detalle: string; icono: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="group flex min-h-[92px] items-center gap-4 rounded-[18px] bg-card p-4 shadow-xl shadow-black/35 transition-transform active:scale-[0.99] md:flex-row md:items-center md:gap-4 md:p-4 hover:md:-translate-y-0.5"
    >
      <span className="flex size-12 shrink-0 items-center justify-center rounded-[14px] bg-primary text-stadium">{icono}</span>
      <span className="flex flex-col gap-0.5 md:gap-1.5">
        <span className="font-heading text-[17px] font-extrabold leading-tight text-stadium md:text-base">{titulo}</span>
        <span className="text-[13px] leading-snug text-[#5c6b73]">{detalle}</span>
      </span>
      <span className="ml-auto flex items-center gap-1">
        <ChevronRight className="size-5 shrink-0 text-stadium transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
