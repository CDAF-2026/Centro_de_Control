import { registroAbierto } from "@/lib/registro/version";
import { leerSesion } from "@/lib/registro/sesion";
import { EnPreparacion } from "../en-preparacion";
import { ConsentimientoForm, type Precargado } from "./consentimiento-form";

/**
 * Firmar el consentimiento (R5, R10). Con sesión del recorrido (viene de
 * "Actualizar datos", Fase 3) se precarga al firmante; sin ella, se pide todo.
 * El texto llega ya partido en párrafos para que el componente de cliente no
 * tenga que saber del marcador de la EPS.
 */
export default async function ConsentimientoPage() {
  const version = await registroAbierto();
  if (!version) return <EnPreparacion />;

  const sesion = await leerSesion();
  const precargado: Precargado | undefined = sesion?.firmante
    ? { firmante: sesion.firmante }
    : undefined;

  return (
    <ConsentimientoForm
      texto={{
        codigo: version.codigo,
        titulo: version.titulo,
        parrafos: version.texto.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean),
      }}
      precargado={precargado}
    />
  );
}
