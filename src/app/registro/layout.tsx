import Image from "next/image";
import Link from "next/link";

/**
 * La página pública del club (se llega por el QR impreso). Vive FUERA de `(app)`
 * como `/quiosco`: sin menú, sin encabezado, sin `requireProfile`. Es la primera
 * pantalla sin sesión que escribe en la base; todo lo que escribe pasa por los
 * RPC de la Fase 1 y la validación del servidor.
 *
 * Mismo lenguaje visual del login (fondo stadium + tarjeta blanca), para que el
 * papá sienta que está en el sitio del club y no en un formulario genérico.
 */
export const dynamic = "force-dynamic";

export default function RegistroLayout({ children }: { children: React.ReactNode }) {
  const year = new Date().getFullYear();
  return (
    <main className="bg-stadium relative flex min-h-screen flex-col items-center overflow-hidden px-4 py-8 md:py-12">
      <div
        aria-hidden
        className="bg-primary/10 pointer-events-none absolute -top-1/4 left-1/2 size-[42rem] -translate-x-1/2 rounded-full blur-3xl"
      />
      <div className="relative w-full max-w-xl">
        <Link href="/registro" className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="bg-primary/10 ring-primary/20 flex size-16 items-center justify-center rounded-2xl ring-1">
            <Image src="/logo-cdaf.png" alt="CDAF" width={44} height={44} className="rounded-lg" priority />
          </div>
          <div className="space-y-1">
            <p className="cdaf-eyebrow text-primary">Centro Deportivo Alejandro Falla</p>
            <h1 className="cdaf-title text-white">Registro de deportistas</h1>
          </div>
        </Link>
        <div className="bg-card rounded-2xl p-6 shadow-xl ring-1 ring-white/5 md:p-8">{children}</div>
        <p className="mt-6 text-center text-xs text-white/40">© {year} Centro Deportivo Alejandro Falla</p>
      </div>
    </main>
  );
}
