import { textosAbiertos, type VersionConsentimiento } from "@/lib/registro/version";
import { leerSesion } from "@/lib/registro/sesion";
import { EnPreparacion } from "../en-preparacion";
import { FondoClaro } from "../cabecera";
import { ConsentimientoForm, type Precargado } from "./consentimiento-form";

/**
 * Firmar el consentimiento (R5, R10), diseño C "Resumen primero" (Laura, 1-oct-2026):
 * pantalla clara, resumen en palabras sencillas, el texto íntegro por partes y la
 * firma al final. Con sesión del recorrido (viene de "Actualizar datos") se precarga
 * al menor y al firmante; sin ella, se pide todo. El texto llega ya partido en
 * párrafos para que el componente de cliente no tenga que saber del marcador de la EPS.
 */
const aTexto = (v: VersionConsentimiento) => ({
  codigo: v.codigo,
  titulo: v.titulo,
  parrafos: v.texto.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean),
});

export default async function ConsentimientoPage() {
  const versiones = await textosAbiertos();
  if (!versiones) return <EnPreparacion />;

  const sesion = await leerSesion();
  const pendiente = sesion?.miembros.filter((m) => !m.firmado && m.datos).at(-1);
  const precargado: Precargado | undefined = sesion?.firmante || pendiente
    ? { firmante: sesion?.firmante ?? undefined, menor: pendiente?.datos }
    : undefined;

  return (
    <FondoClaro>
      <ConsentimientoForm textos={{ menores: aTexto(versiones.menores), adultos: aTexto(versiones.adultos) }} precargado={precargado} />
    </FondoClaro>
  );
}
