import Link from "next/link";
import { registroAbierto } from "@/lib/registro/version";
import { EnPreparacion } from "../en-preparacion";

/**
 * El formulario de datos llega con la Fase 3. Mientras tanto la landing ofrece el
 * camino y aquí se explica en vez de dar un 404 — un enlace muerto en el QR del
 * club se lee como "esto no sirve".
 */
export default async function RegistroDatosPage() {
  const version = await registroAbierto();
  if (!version) return <EnPreparacion />;
  return (
    <div className="space-y-4 text-center">
      <h2 className="font-heading text-xl font-semibold tracking-tight">Muy pronto</h2>
      <p className="text-muted-foreground text-sm">
        La actualización de datos desde el celular está en construcción. Por ahora, recepción toma tus datos y
        aquí puedes firmar el consentimiento informado.
      </p>
      <Link href="/registro/consentimiento" className="text-primary text-sm font-medium hover:underline">
        Ir a firmar el consentimiento →
      </Link>
    </div>
  );
}
