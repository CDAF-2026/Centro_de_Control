/**
 * Lo que ve el papá mientras no haya una versión vigente del consentimiento. Es la
 * puerta del despliegue: el código puede estar publicado sin que nadie firme hasta
 * que se abra la versión (Fase 4). Es un componente de servidor sin estado para
 * poder montarlo en las pruebas de render.
 */
import { Cabecera } from "./cabecera";

export function EnPreparacion() {
  return (
    <Cabecera titulo="Registro de deportistas">
    <div className="space-y-3 text-center">
      <h2 className="font-heading text-xl font-semibold tracking-tight">Estamos preparando el registro</h2>
      <p className="text-muted-foreground text-sm">
        Muy pronto vas a poder actualizar los datos de tu deportista y firmar el consentimiento desde aquí. Por
        ahora, acércate a recepción.
      </p>
    </div>
    </Cabecera>
  );
}
