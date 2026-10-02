/**
 * Cómo se PRESENTA el texto del consentimiento en la página pública (diseño C,
 * "Resumen primero", elegido por Laura el 1-oct-2026). Sin "server-only": lo usa el
 * formulario, que es un componente de cliente.
 *
 * El texto legal NO se toca: llega de `consentimiento_version` y se muestra íntegro.
 * Lo que vive aquí es la capa de lectura: un título corto por párrafo (para el
 * acordeón) y el resumen en palabras sencillas. Van atados al CÓDIGO de la versión
 * y al número de párrafos: si el club cambia el texto, la versión nueva sale con
 * títulos genéricos ("Parte 1…") hasta que alguien escriba los suyos aquí.
 */
const TITULOS: Record<string, string[]> = {
  "2026-10": [
    "Participación voluntaria",
    "Salud, preparación y reglamento",
    "Riesgos y comportamiento",
    "EPS y cobertura en salud",
    "Primeros auxilios",
    "Instrucciones y normas",
    "Sanciones",
    "Datos personales e imagen (Ley 1581)",
    "Fotografías de mi hijo(a)",
    "Declaración final",
  ],
};

/** Un título corto por párrafo; genéricos si la versión no tiene los suyos. */
export function titulosDelTexto(codigo: string, nParrafos: number): string[] {
  const propios = TITULOS[codigo];
  if (propios && propios.length === nParrafos) return propios;
  return Array.from({ length: nParrafos }, (_, i) => `Parte ${i + 1}`);
}

/**
 * "En resumen": lo que acepta quien firma, en lenguaje claro. Orienta, no reemplaza:
 * la pantalla lo dice y lo que se firma es el texto completo.
 */
export function resumenDelConsentimiento(nombre: string, eps: string, mayor: boolean): string[] {
  const n = nombre.trim() || (mayor ? "" : "tu hijo(a)");
  const e = eps.trim() || "…";
  return mayor
    ? [
        "Participas voluntariamente y estás en condiciones de salud para hacer deporte.",
        "Conoces y aceptas el reglamento del club, y asumes los riesgos propios del deporte.",
        `Tu EPS (${e}) cubre la atención médica; el club no responde por lesiones.`,
        "El club puede retirar de la clase a quien agreda a otros, sin devolución de dinero.",
        "Autorizas el uso de tus datos y fotos en la web y redes del club (Ley 1581 de 2012).",
      ]
    : [
        `${n} participa voluntariamente y está en condiciones de salud para hacer deporte.`,
        "Conoces y aceptas el reglamento del club, y asumes los riesgos propios del deporte.",
        `Su EPS (${e}) cubre la atención médica; el club no responde por lesiones.`,
        "El club puede retirar de la clase a quien agreda a otros, sin devolución de dinero.",
        `Autorizas el uso de datos y fotos de ${n} en la web y redes del club (Ley 1581 de 2012).`,
      ];
}
