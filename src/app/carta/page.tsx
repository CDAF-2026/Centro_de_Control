import { leerCartaPublica } from "@/lib/cafeteria/publica";
import { Pedido } from "./pedido";

/**
 * La página a la que lleva el QR de la cafetería. Es UN solo QR para todo el
 * club (Laura, 20-nov-2026): la persona escribe dónde está al hacer el pedido,
 * así que la dirección ya no trae la zona.
 *
 * La carta se lee de la base en cada visita: lo que la cafetería apague en el
 * panel deja de salir aquí de inmediato.
 */
export default async function CartaPage() {
  const carta = await leerCartaPublica();

  if (!carta) {
    return (
      <Aviso titulo="No pudimos cargar la carta" texto="Intenta de nuevo en un momento o pide directamente en la cafetería." />
    );
  }
  if (carta.categorias.length === 0) {
    return (
      <Aviso titulo="La carta no está disponible" texto="En este momento no hay productos para pedir desde aquí. Pasa por la cafetería." />
    );
  }

  return <Pedido categorias={carta.categorias} whatsapp={carta.whatsapp} />;
}

function Aviso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="flex flex-1 flex-col justify-center px-4 pt-4">
      <section className="bg-card space-y-2 rounded-2xl p-6 text-center shadow-[0_1px_2px_rgba(26,28,30,0.06),0_6px_18px_rgba(26,28,30,0.06)]">
        <p className="text-[10px] font-bold tracking-[0.18em] text-[#46530a] uppercase">Centro Deportivo Alejandro Falla</p>
        <h1 className="font-heading text-xl leading-tight font-extrabold uppercase italic">{titulo}</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">{texto}</p>
      </section>
    </div>
  );
}
