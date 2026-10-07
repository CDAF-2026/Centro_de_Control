import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { leerSesion } from "@/lib/registro/sesion";
import { edadDesde } from "@/lib/validations/cliente";
import { terminarRecorrido } from "./actions";
import { Button } from "@/components/ui/button";
import { Cabecera } from "../cabecera";

/**
 * Confirmación (R9: "¿otro hijo?"). Lo único que se muestra es lo que la propia
 * persona acaba de escribir (el nombre del deportista, desde la sesión): nunca un
 * dato de la ficha.
 */
export default async function RegistroListoPage({ searchParams }: { searchParams: Promise<{ ya?: string }> }) {
  const { ya } = await searchParams;
  const sesion = await leerSesion();
  const miembro = sesion?.miembros.at(-1) ?? null;
  const ultimo = miembro?.nombre ?? null;
  const firmados = sesion?.miembros.filter((m) => m.firmado).length ?? 0;
  // Un adulto firma en nombre propio (club, 7-oct-2026): no se le ofrece "otro hijo", solo volver al inicio.
  const edad = edadDesde(miembro?.datos?.fechaNacimiento ?? null);
  const adulto = !!miembro?.mayor || (edad != null && edad >= 18);

  return (
    <Cabecera titulo="Registro de deportistas">
    <div className="space-y-6 text-center">
      <div className="bg-primary/15 ring-primary/25 mx-auto flex size-16 items-center justify-center rounded-full ring-1">
        <CheckCircle2 className="text-[#46530a] size-8" />
      </div>
      <div className="space-y-2">
        <h2 className="font-heading text-xl font-semibold tracking-tight">¡Listo{ultimo ? `, ${ultimo.split(" ")[0]}${adulto ? "" : " queda registrado"}` : ""}!</h2>
        <p className="text-muted-foreground text-sm">
          {adulto
            ? (miembro?.firmado ? "Tu consentimiento firmado quedó guardado en el Centro Deportivo Alejandro Falla." : "Tus datos quedaron guardados en el Centro Deportivo Alejandro Falla.")
            : ya === "1"
            ? "Este consentimiento ya estaba firmado y guardado en la ficha del deportista. No hace falta firmarlo otra vez."
            : "El consentimiento firmado quedó guardado en la ficha del deportista en el Centro Deportivo Alejandro Falla."}
          {firmados > 1 ? ` Llevas ${firmados} consentimientos firmados en esta visita.` : ""}
        </p>
      </div>

      {adulto ? (
        <form action={terminarRecorrido}>
          <Button type="submit" size="lg" className="w-full sm:w-auto sm:min-w-56">Volver al inicio</Button>
        </form>
      ) : (<>
      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/registro/datos" className="bg-primary text-primary-foreground hover:brightness-95 inline-flex h-11 items-center justify-center rounded-lg px-4 text-sm font-medium shadow-sm">
          Registrar otro hijo(a)
        </Link>
        <form action={terminarRecorrido}>
          <Button type="submit" variant="outline" size="lg" className="w-full">No, gracias · terminar</Button>
        </form>
      </div>
      <p className="text-muted-foreground text-xs">
        Si solo falta la firma de otro hijo(a), <Link href="/registro/consentimiento" className="text-foreground font-semibold underline underline-offset-2">fírmala aquí</Link>. Puedes cerrar esta página cuando termines.
      </p>
      </>)}
    </div>
    </Cabecera>
  );
}
