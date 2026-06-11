"use client";

import { useActionState } from "react";
import { uploadEmpleadoDocumento, deleteEmpleadoDocumento, type EmpleadoFormState } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export type EmpDocItem = {
  id: number;
  tipo: string;
  nombre_archivo: string;
  storage_path: string;
  url: string | null;
};

const TIPO_LABEL: Record<string, string> = {
  contrato: "Contrato",
  hoja_vida: "Hoja de vida",
  otro: "Otro",
};

export function EmpleadoDocumentos({
  empleadoId,
  docs,
  puedeEditar,
}: {
  empleadoId: string;
  docs: EmpDocItem[];
  puedeEditar: boolean;
}) {
  const [state, action, pending] = useActionState<EmpleadoFormState, FormData>(uploadEmpleadoDocumento, {});

  return (
    <div className="space-y-4">
      {docs.length === 0 ? (
        <p className="text-muted-foreground text-sm">Sin documentos.</p>
      ) : (
        <ul className="divide-y text-sm">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                {d.url ? (
                  <a href={d.url} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">
                    {d.nombre_archivo}
                  </a>
                ) : (
                  <span className="font-medium">{d.nombre_archivo}</span>
                )}
                <Badge variant="outline" className="ml-2">{TIPO_LABEL[d.tipo] ?? d.tipo}</Badge>
              </div>
              {puedeEditar && (
                <form action={deleteEmpleadoDocumento}>
                  <input type="hidden" name="id" value={d.id} />
                  <input type="hidden" name="empleadoId" value={empleadoId} />
                  <input type="hidden" name="path" value={d.storage_path} />
                  <Button type="submit" variant="ghost" size="sm">Eliminar</Button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      {puedeEditar && (
        <form action={action} className="space-y-3 border-t pt-4">
          <input type="hidden" name="empleadoId" value={empleadoId} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="tipo">Tipo</Label>
              <select id="tipo" name="tipo" className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm">
                <option value="contrato">Contrato</option>
                <option value="hoja_vida">Hoja de vida</option>
                <option value="otro">Otro</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="archivo">Archivo (máx. 10 MB)</Label>
              <Input id="archivo" name="archivo" type="file" required />
            </div>
          </div>
          {state.error && <p className="text-destructive text-sm">{state.error}</p>}
          {state.ok && <p className="text-muted-foreground text-sm">{state.ok}</p>}
          <Button type="submit" disabled={pending}>{pending ? "Subiendo…" : "Subir documento"}</Button>
        </form>
      )}
    </div>
  );
}
