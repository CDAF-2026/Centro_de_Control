import Link from "next/link";
import { ClipboardList, PenLine } from "lucide-react";
import { registroAbierto } from "@/lib/registro/version";
import { EnPreparacion } from "./en-preparacion";

/** La landing del QR: dos caminos (R1). Sin versión vigente del texto, no hay nada que hacer aquí. */
export default async function RegistroPage() {
  const version = await registroAbierto();
  if (!version) return <EnPreparacion />;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-xl font-semibold tracking-tight">¿Qué necesitas hacer?</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Toma menos de cinco minutos. Ten a la mano el documento del deportista y el del padre, madre o acudiente.
        </p>
      </div>

      <div className="grid gap-3">
        <Link
          href="/registro/datos"
          className="group hover:border-primary/60 flex items-start gap-4 rounded-xl border p-4 shadow-sm transition-colors"
        >
          <span className="bg-muted group-hover:bg-primary/15 flex size-11 shrink-0 items-center justify-center rounded-lg transition-colors">
            <ClipboardList className="size-5" />
          </span>
          <span>
            <span className="font-heading block font-semibold">Actualizar o ingresar datos</span>
            <span className="text-muted-foreground block text-sm">
              Llena la ficha del deportista (datos personales, acudientes y facturación) y firma el consentimiento al final.
            </span>
          </span>
        </Link>

        <Link
          href="/registro/consentimiento"
          className="group hover:border-primary/60 flex items-start gap-4 rounded-xl border p-4 shadow-sm transition-colors"
        >
          <span className="bg-muted group-hover:bg-primary/15 flex size-11 shrink-0 items-center justify-center rounded-lg transition-colors">
            <PenLine className="size-5" />
          </span>
          <span>
            <span className="font-heading block font-semibold">Firmar el consentimiento informado</span>
            <span className="text-muted-foreground block text-sm">
              Si los datos del deportista ya están al día, solo lee el consentimiento y fírmalo.
            </span>
          </span>
        </Link>
      </div>

      <p className="text-muted-foreground text-xs">
        Si tienes más de un hijo en el club, el proceso se hace una vez por cada uno.
      </p>
    </div>
  );
}
