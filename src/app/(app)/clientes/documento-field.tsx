"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TIPOS_DOCUMENTO } from "./documento";

/**
 * Tipo + número de documento en una sola fila. El número es la llave con la que
 * se le atribuyen al cliente sus facturas de Siigo (documento = NIT), por eso
 * va primero y con más ancho; el tipo es informativo.
 */
export function DocumentoField({
  tipo,
  numero,
  error,
}: {
  tipo: string;
  numero: string;
  error?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor="documento">Documento</Label>
      <div className="flex gap-2">
        <select
          id="tipoDocumento"
          name="tipoDocumento"
          defaultValue={tipo}
          aria-label="Tipo de documento"
          className="border-input bg-background h-9 w-28 shrink-0 rounded-md border px-2 text-sm"
        >
          <option value="">—</option>
          {TIPOS_DOCUMENTO.map((t) => (
            <option key={t.valor} value={t.valor}>
              {t.valor}
            </option>
          ))}
        </select>
        <Input id="documento" name="documento" defaultValue={numero} className="tabular-nums" />
      </div>
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
}
