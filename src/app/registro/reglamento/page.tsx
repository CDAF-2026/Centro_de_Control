import { reglamentoVigente } from "@/lib/registro/version";
import { parsearReglamento } from "@/lib/registro/reglamento";
import { FondoClaro } from "../cabecera";
import { EnPreparacion } from "../en-preparacion";
import { ReglamentoVista } from "./reglamento-vista";

/**
 * El Reglamento General del club, a un toque desde la casilla del consentimiento (opción A,
 * Laura, 8-oct-2026) y compartible por sí solo. Misma presentación que el texto del
 * consentimiento: capítulos con sus artículos plegables, "Abrir todo" y descarga en PDF.
 * No depende de `REGISTRO_PUBLICO`: solo de que haya un reglamento vigente.
 */
export default async function ReglamentoPage() {
  const v = await reglamentoVigente();
  if (!v) return <EnPreparacion />;
  return (
    <FondoClaro>
      <ReglamentoVista titulo={v.titulo} codigo={v.codigo} vigenteDesde={v.vigente_desde} reglamento={parsearReglamento(v.texto)} />
    </FondoClaro>
  );
}
