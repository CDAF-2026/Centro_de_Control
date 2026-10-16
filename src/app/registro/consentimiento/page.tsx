import { reglamentoAcademiasVigente, textosAbiertos, type VersionConsentimiento } from "@/lib/registro/version";
import { leerSesion } from "@/lib/registro/sesion";
import { EnPreparacion } from "../en-preparacion";
import { FondoClaro } from "../cabecera";
import { ConsentimientoForm, type Precargado } from "./consentimiento-form";

/**
 * Firmar el consentimiento (R5, R10), diseño C "Resumen primero" (Laura, 1-oct-2026):
 * pantalla clara, resumen en palabras sencillas, el texto íntegro por partes y la
 * firma al final. Con sesión del recorrido (viene de "Actualizar datos") se precarga
 * al menor y al firmante; sin ella, se pide todo. Llega el
 * texto completo de la versión, con su id: el formulario lo parte y lo devuelve al firmar,
 * para que lo firmado sea exactamente lo leído.
 */
const aTexto = (v: VersionConsentimiento) => ({ id: v.id, codigo: v.codigo, titulo: v.titulo, texto: v.texto });

export default async function ConsentimientoPage() {
  const versiones = await textosAbiertos();
  if (!versiones) return <EnPreparacion />;

  const academias = await reglamentoAcademiasVigente();
  const sesion = await leerSesion();
  const pendiente = sesion?.miembros.filter((m) => !m.firmado && m.datos).at(-1);
  const precargado: Precargado | undefined = sesion?.firmante || pendiente
    ? { firmante: sesion?.firmante ?? undefined, menor: pendiente?.datos }
    : undefined;

  return (
    <FondoClaro>
      <ConsentimientoForm textos={{ menores: aTexto(versiones.menores), adultos: aTexto(versiones.adultos) }}
        academias={academias ? { id: academias.id, codigo: academias.codigo } : null}
        precargado={precargado}
      />
    </FondoClaro>
  );
}
