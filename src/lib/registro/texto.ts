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
  const completo = nombre.trim();
  const n = completo || "Tu hijo(a)";
  const pila = completo.split(/\s+/)[0] || "tu hijo(a)";
  const e = eps.trim() || "…";
  return mayor
    ? [
        "Participas voluntariamente en las actividades deportivas y estás en condiciones de salud para hacerlo.",
        "Conoces y aceptas el reglamento del centro deportivo, y asumes los riesgos propios de la práctica del deporte.",
        `Tu EPS (${e}) cubre la atención médica si ocurre un accidente o una lesión; el centro deportivo no asume esa responsabilidad.`,
        "Si agredes a un compañero o a un profesor, el centro deportivo puede retirarte de la clase sin devolver el dinero.",
        "Autorizas el tratamiento de tus datos personales y el uso de tus fotos y videos en la página web y las redes sociales del centro deportivo (Ley 1581 de 2012).",
      ]
    : [
        `${n} participa voluntariamente en las actividades deportivas y está en condiciones de salud para hacerlo.`,
        "Conoces y aceptas el reglamento del centro deportivo, y asumes los riesgos propios de la práctica del deporte.",
        `La EPS de ${pila} (${e}) cubre la atención médica si ocurre un accidente o una lesión; el centro deportivo no asume esa responsabilidad.`,
        "Si el deportista agrede a un compañero o a un profesor, el centro deportivo puede retirarlo de la clase sin devolver el dinero.",
        `Autorizas el tratamiento de los datos personales de ${pila} y el uso de sus fotos y videos en la página web y las redes sociales del centro deportivo (Ley 1581 de 2012).`,
      ];
}
