import { registroAbierto } from "@/lib/registro/version";
import { leerSesion } from "@/lib/registro/sesion";
import { EnPreparacion } from "../en-preparacion";
import { Cabecera } from "../cabecera";
import { DatosForm } from "./datos-form";

/**
 * "Actualizar o ingresar datos" (R2–R4), diseño A "Paso a paso" (Laura, 1-oct-2026):
 * un paso por pantalla con barra de progreso. Con sesión del recorrido (viene de
 * "¿otro hijo?") se precarga el acudiente principal para no volver a escribirlo (R9).
 */
export default async function RegistroDatosPage() {
  const version = await registroAbierto();
  if (!version) return <EnPreparacion />;
  const sesion = await leerSesion();
  return (
    <Cabecera titulo="Actualizar datos" sinTarjeta ancho="xl">
      <DatosForm firmante={sesion?.firmante ?? null} />
    </Cabecera>
  );
}
