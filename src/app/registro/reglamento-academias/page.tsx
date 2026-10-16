import { reglamentoAcademiasVigente } from "@/lib/registro/version";
import { parsearReglamento } from "@/lib/registro/reglamento";
import { FondoClaro } from "../cabecera";
import { EnPreparacion } from "../en-preparacion";
import { ReglamentoVista } from "../reglamento/reglamento-vista";

/**
 * El Reglamento de las Academias de Tenis y Pádel (16-oct-2026): lo acepta, con su propia casilla, quien
 * firma el consentimiento por un menor, y se abre a un toque desde ahí. Misma presentación que el
 * Reglamento General: sus nueve puntos plegables (uno abierto a la vez) y descarga en PDF.
 * No depende de `REGISTRO_PUBLICO`: solo de que haya una versión vigente.
 */
export default async function ReglamentoAcademiasPage() {
  const v = await reglamentoAcademiasVigente();
  if (!v) return <EnPreparacion />;
  return (
    <FondoClaro>
      <ReglamentoVista
        nombre="Reglamento de Academias"
        pdfHref="/registro/reglamento-academias/pdf"
        titulo={v.titulo}
        codigo={v.codigo}
        vigenteDesde={v.vigente_desde}
        reglamento={parsearReglamento(v.texto)}
      />
    </FondoClaro>
  );
}
