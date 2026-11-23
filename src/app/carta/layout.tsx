import type { Metadata, Viewport } from "next";

/**
 * La carta de la cafetería: la página a la que lleva el QR de la cafetería
 * (20-nov-2026). Vive FUERA de `(app)`, como `/registro` y `/quiosco`: sin
 * menú, sin sesión. Lo que el comprador ve y lo que se guarda pasa por el
 * servidor (`leerCartaPublica` y `/carta/pedidos`); el panel que la administra
 * es `/cafeteria`.
 *
 * Mismo lenguaje visual que el consentimiento informado (pantalla clara,
 * tarjetas blancas, lo elegido en negro stadium con texto lima).
 *
 * La carta tiene una barra fija abajo ("Categorías" y "Mi pedido"), marcada con
 * `data-barra-fija`: cuando está, el marco deja espacio para que no tape el pie.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Cafetería · Centro Deportivo Alejandro Falla",
  description: "Pide a la cafetería desde donde estés en el club y te lo llevamos.",
};

export const viewport: Viewport = { themeColor: "#f4f6f5" };

export default function CartaLayout({ children }: { children: React.ReactNode }) {
  const year = new Date().getFullYear();
  return (
    <main className="bg-background flex min-h-screen flex-col items-center has-[[data-barra-fija]]:pb-24">
      <div className="flex w-full max-w-md flex-1 flex-col">
        {children}
        <p className="text-muted-foreground px-6 pt-4 pb-6 text-center text-[11px]">
          © {year} Centro Deportivo Alejandro Falla · alejandrofallacd.com
        </p>
      </div>
    </main>
  );
}
