import type { Servicio } from "@/lib/database.types";
import { Badge } from "@/components/ui/badge";

/**
 * Tarjeta de servicio, SOLO LECTURA (decisión de Laura, 31-jul-2026).
 *
 * Antes tenía editar y eliminar. Se quitaron junto con `servicio-form.tsx` y
 * `config/actions.ts`: el catálogo no se toca a mano — cada servicio está atado a
 * un grupo de producto de Siigo, y a sus ids cuelgan `academias.servicio_id`,
 * `eventos.servicio_id`, `profesor_regla.servicio_id` (la comisión del 25% de
 * Joaquín y Leo) y 293 líneas de `siigo_factura_lineas`. Renombrar o borrar aquí
 * rompe cosas lejos y en silencio.
 *
 * Esta pantalla queda como diagnóstico: ver qué servicio reclama cada grupo de
 * Siigo, y el aviso de los que no reclama nadie. Por eso ahora SÍ se muestra
 * `siigo_grupo`, que antes no se veía y es justo el campo que se rompe cuando el
 * club renombra un grupo allá.
 *
 * Si hay que corregir un mapeo, va por migración.
 */
const CAT_LABEL: Record<string, string> = {
  academia: "Academia",
  paquete: "Paquete",
  particular: "Clase particular",
};

export function ServicioCard({ servicio }: { servicio: Servicio }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-semibold">
          <span
            className="size-3 shrink-0 rounded-sm"
            style={{ backgroundColor: servicio.color ?? "#8aa0a8" }}
          />
          {servicio.nombre}
        </span>
        {servicio.categoria_saldo ? (
          <Badge variant="secondary">{CAT_LABEL[servicio.categoria_saldo]}</Badge>
        ) : (
          <Badge variant="outline">Informativo</Badge>
        )}
      </div>

      <dl className="text-muted-foreground mt-3 space-y-1 text-xs">
        <div className="flex gap-1.5">
          <dt className="shrink-0">Grupo en Siigo:</dt>
          <dd className="text-foreground break-all">
            {servicio.siigo_grupo ? (
              <code>{servicio.siigo_grupo}</code>
            ) : (
              <span className="text-muted-foreground italic">sin grupo asignado</span>
            )}
          </dd>
        </div>
      </dl>

      {!servicio.activo && (
        <div className="mt-2">
          <Badge variant="outline">Inactivo</Badge>
        </div>
      )}
    </div>
  );
}
