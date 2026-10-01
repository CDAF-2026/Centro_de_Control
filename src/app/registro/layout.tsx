/**
 * La página pública del club (se llega por el QR impreso). Vive FUERA de `(app)`
 * como `/quiosco`: sin menú, sin encabezado, sin `requireProfile`. Es la primera
 * pantalla sin sesión que escribe en la base; todo lo que escribe pasa por los
 * RPC de la Fase 1 y la validación del servidor.
 *
 * Diseño "A · Cancha" (elegido por Laura el 1-oct-2026): fondo stadium, foto de
 * Alejandro Falla en blanco y negro arriba de la landing, logo lima montado sobre
 * el borde de la foto, tarjetas blancas. Las pantallas interiores (consentimiento,
 * listo, datos) llevan la cabecera compacta (`Cabecera`) y la tarjeta blanca.
 */
export const dynamic = "force-dynamic";

export default function RegistroLayout({ children }: { children: React.ReactNode }) {
  const year = new Date().getFullYear();
  return (
    <main className="bg-stadium relative flex min-h-screen flex-col items-center overflow-hidden">
      <div className="relative flex w-full max-w-md flex-1 flex-col">
        {children}
        <p className="px-6 pb-6 pt-4 text-center text-[11px] text-white/35">
          © {year} Centro Deportivo Alejandro Falla · alejandrofallacd.com
        </p>
      </div>
    </main>
  );
}
