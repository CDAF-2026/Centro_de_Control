import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { ImportForm } from "./import-form";

const COLUMNAS =
  "nombres, apellidos, documento, fecha_nacimiento, celular, email, emergencia_nombre, emergencia_celular, emergencia_parentesco, acudiente_nombre, acudiente_documento, acudiente_telefono, acudiente_parentesco";

export default async function ImportarClientesPage() {
  await requireRole(["superadmin", "coord_admin", "recepcion"]);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href="/clientes" className="text-muted-foreground text-sm hover:underline">
          ← Clientes
        </Link>
        <h1 className="cdaf-headline mt-1">Importar clientes (CSV)</h1>
      </div>

      <div className="text-muted-foreground space-y-2 text-sm">
        <p>Sube un archivo <strong>.csv</strong> con una fila por cliente. La primera fila debe ser el encabezado con estas columnas:</p>
        <code className="bg-muted block rounded-md p-3 text-xs">{COLUMNAS}</code>
        <p>
          <strong className="text-foreground">nombres</strong> y{" "}
          <strong className="text-foreground">apellidos</strong> son obligatorios. La fecha va en
          formato <strong className="text-foreground">AAAA-MM-DD</strong> (también acepta
          DD/MM/AAAA). Si el cliente es <strong className="text-foreground">menor de edad</strong>,{" "}
          <strong className="text-foreground">acudiente_nombre</strong> es obligatorio.
        </p>
        <a href="/clientes/importar/plantilla" className="text-foreground inline-block underline">
          ↓ Descargar plantilla de ejemplo
        </a>
      </div>

      <ImportForm />
    </div>
  );
}
