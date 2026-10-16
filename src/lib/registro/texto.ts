/**
 * Cómo se PRESENTA el texto del consentimiento en la página pública (diseño C,
 * "Resumen primero", elegido por Laura el 1-oct-2026). Sin "server-only": lo usa el
 * formulario, que es un componente de cliente.
 *
 * El texto legal NO se toca: llega de `consentimiento_version` y se muestra íntegro.
 * Lo que vive aquí es la capa de lectura: un título corto por parte (para el acordeón)
 * y el resumen en palabras sencillas.
 *
 * Dos formatos de texto:
 *  · Los de oct-2026 revisados por el abogado (`2026-10-v2`, `2026-10-adultos-v3`): un párrafo de
 *    entrada "Yo, {{FIRMANTE}}…", numerales "N. Título. texto" (los párrafos de un mismo numeral van
 *    con salto simple) y el bloque "AUTORIZACIONES" con las opciones [salud], [imagen] e [informacion].
 *    El título de cada parte sale del propio numeral.
 *    Desde `2026-10-v3` / `2026-10-adultos-v4` (fotos obligatorias, Laura, 16-oct-2026) el bloque se llama
 *    "AUTORIZACIÓN": la aceptación es UNA sola (el chulito "Apruebo") y solo [informacion] queda como
 *    casilla opcional. `autorizaciones.unica` lo distingue.
 *  · Los anteriores (`2026-10`, `2026-10-adultos`, `-v2`): un párrafo por parte, con títulos escritos
 *    aquí y atados al código de la versión.
 */
const TITULOS_ADULTOS = [
  "Participación voluntaria",
  "Salud, preparación y reglamento",
  "Riesgos y comportamiento",
  "EPS y cobertura en salud",
  "Primeros auxilios",
  "Instrucciones y normas",
  "Sanciones",
  "Datos personales e imagen (Ley 1581)",
  "Fotografías",
  "Declaración final",
];
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
  "2026-10-adultos": TITULOS_ADULTOS,
  "2026-10-adultos-v2": TITULOS_ADULTOS,
};

/** Un título corto por párrafo; genéricos si la versión no tiene los suyos. */
export function titulosDelTexto(codigo: string, nParrafos: number): string[] {
  const propios = TITULOS[codigo];
  if (propios && propios.length === nParrafos) return propios;
  return Array.from({ length: nParrafos }, (_, i) => `Parte ${i + 1}`);
}

export type ClaveAutorizacion = "salud" | "imagen" | "informacion";
export const CLAVES_AUTORIZACION: ClaveAutorizacion[] = ["salud", "imagen", "informacion"];
export type Autorizacion = { clave: ClaveAutorizacion; titulo: string; texto: string };
/** Una parte del acordeón: número (vacío en los textos viejos), título y sus párrafos. */
export type ParteConsentimiento = { numero: string; titulo: string; parrafos: string[] };
export type ConsentimientoPartido = {
  /** "Yo, …, declaro:" (solo en los textos con formato nuevo). */
  entrada: string[];
  partes: ParteConsentimiento[];
  /**
   * El bloque de autorizaciones; null en los textos viejos, que no lo tienen.
   * `unica` = bloque "AUTORIZACIÓN" (desde v3): la aceptación es la del chulito y las opciones son
   * casillas voluntarias. Si no, "AUTORIZACIONES" con SÍ/NO obligatorio en cada opción.
   */
  autorizaciones: { unica: boolean; intro: string[]; opciones: Autorizacion[]; cierre: string[] } | null;
};

const NUMERAL = /^(\d+)\.\s+([^.]+)\.\s+([\s\S]*)$/;
const OPCION = /^\[(salud|imagen|informacion)\]\s+([^.]+)\.\s+([\s\S]*)$/;

/** Parte el texto de una versión en entrada, partes y autorizaciones. Lógica pura, con pruebas. */
export function partirConsentimiento(codigo: string, texto: string): ConsentimientoPartido {
  const bloques = texto.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const numerado = bloques.some((b) => NUMERAL.test(b));
  if (!numerado) {
    const titulos = titulosDelTexto(codigo, bloques.length);
    return { entrada: [], partes: bloques.map((b, i) => ({ numero: "", titulo: titulos[i], parrafos: [b] })), autorizaciones: null };
  }
  const out: ConsentimientoPartido = { entrada: [], partes: [], autorizaciones: null };
  let enAutorizaciones = false;
  for (const b of bloques) {
    if (b === "AUTORIZACIONES" || b === "AUTORIZACIÓN") {
      enAutorizaciones = true;
      out.autorizaciones = { unica: b === "AUTORIZACIÓN", intro: [], opciones: [], cierre: [] };
      continue;
    }
    if (enAutorizaciones && out.autorizaciones) {
      const m = b.match(OPCION);
      if (m) out.autorizaciones.opciones.push({ clave: m[1] as ClaveAutorizacion, titulo: m[2].trim(), texto: m[3].trim() });
      else if (out.autorizaciones.opciones.length) out.autorizaciones.cierre.push(b);
      else out.autorizaciones.intro.push(b);
      continue;
    }
    const m = b.match(NUMERAL);
    if (m) {
      const lineas = m[3].split("\n").map((l) => l.trim()).filter(Boolean);
      out.partes.push({ numero: m[1], titulo: m[2].trim(), parrafos: lineas });
    } else if (!out.partes.length) out.entrada.push(b);
    else out.partes[out.partes.length - 1].parrafos.push(...b.split("\n").map((l) => l.trim()).filter(Boolean));
  }
  return out;
}

/** Los valores que se escriben en los marcadores del texto ("Yo, {{FIRMANTE}}…"). */
export type ValoresTexto = { firmante?: string; documento?: string; calidad?: string; eps?: string };
export const VACIO = "____________";

/** Pone los valores en los marcadores; lo que falte queda como raya, igual que en el papel. */
export function rellenar(texto: string, v: ValoresTexto): string {
  return texto
    .replace(/\{\{FIRMANTE\}\}/g, v.firmante?.trim() || VACIO)
    .replace(/\{\{DOCUMENTO\}\}/g, v.documento?.trim() || VACIO)
    .replace(/\{\{CALIDAD\}\}/g, v.calidad?.trim() || "padre, madre o representante legal")
    .replace(/\{\{EPS\}\}/g, v.eps?.trim() || VACIO);
}

/** "Madre" → "madre"; el "Otro" de la pantalla (valor "Acudiente") es el representante legal. */
export function calidadDelFirmante(parentesco: string | null | undefined): string {
  if (parentesco === "Madre") return "madre";
  if (parentesco === "Padre") return "padre";
  if (parentesco) return "representante legal";
  return "";
}

/**
 * "En resumen": lo que acepta quien firma, en lenguaje claro. Orienta, no reemplaza:
 * la pantalla lo dice y lo que se firma es el texto completo.
 * `conAutorizaciones` = el texto de oct-2026, donde fotos y datos de salud se eligen con SÍ/NO.
 */
export function resumenDelConsentimiento(nombre: string, eps: string, mayor: boolean, conAutorizaciones: boolean | "unica" = false): string[] {
  const completo = nombre.trim();
  const n = completo || "Tu hijo(a)";
  const pila = completo.split(/\s+/)[0] || "tu hijo(a)";
  const e = eps.trim();
  if (conAutorizaciones === "unica") {
    return mayor
      ? [
          "Participas voluntariamente en las actividades deportivas y estás en condiciones de salud para hacerlo.",
          "Conoces y aceptas el Reglamento General del centro deportivo, y asumes los riesgos propios de la práctica del deporte.",
          `Tu EPS${e ? ` (${e})` : ""} cubre la atención médica si ocurre un accidente o una lesión; el centro deportivo solo responde si hay dolo o culpa grave.`,
          "Si agredes a un compañero o a un profesor, el centro deportivo puede retirarte de la clase sin devolver el dinero.",
          "Tus datos se usan para tu inscripción, el contacto, las emergencias y la facturación (Ley 1581 de 2012). La EPS y el RH son opcionales.",
          "Autorizas el uso de fotos y videos en la página web, las redes sociales y el material impreso del centro: en las clases se toman fotos de grupo, por eso es condición para participar.",
        ]
      : [
          `${n} participa voluntariamente en las actividades deportivas y está en condiciones de salud para hacerlo.`,
          `Conoces y aceptas el Reglamento General del centro deportivo, y asumes en nombre de ${pila} los riesgos propios de la práctica del deporte.`,
          `La EPS de ${pila}${e ? ` (${e})` : ""} cubre la atención médica si ocurre un accidente o una lesión; el centro deportivo solo responde si hay dolo o culpa grave.`,
          "Si el deportista agrede a un compañero o a un profesor, el centro deportivo puede retirarlo de la clase sin devolver el dinero.",
          `Los datos de ${pila} se usan para su inscripción, el contacto con la familia, las emergencias y la facturación (Ley 1581 de 2012). La EPS y el RH son opcionales.`,
          `Autorizas el uso de fotos y videos de ${pila} en la página web, las redes sociales y el material impreso del centro, sin su nombre completo: en las clases se toman fotos de grupo, por eso es condición para participar.`,
        ];
  }
  if (conAutorizaciones) {
    return mayor
      ? [
          "Participas voluntariamente en las actividades deportivas y estás en condiciones de salud para hacerlo.",
          "Conoces y aceptas el Reglamento General del centro deportivo, y asumes los riesgos propios de la práctica del deporte.",
          `Tu EPS${e ? ` (${e})` : ""} cubre la atención médica si ocurre un accidente o una lesión; el centro deportivo solo responde si hay dolo o culpa grave.`,
          "Si agredes a un compañero o a un profesor, el centro deportivo puede retirarte de la clase sin devolver el dinero.",
          "Tus datos se usan para tu inscripción, el contacto, las emergencias y la facturación (Ley 1581 de 2012). Los datos de salud, las fotos y la información del centro los autorizas tú, con SÍ o NO.",
        ]
      : [
          `${n} participa voluntariamente en las actividades deportivas y está en condiciones de salud para hacerlo.`,
          `Conoces y aceptas el Reglamento General del centro deportivo, y asumes en nombre de ${pila} los riesgos propios de la práctica del deporte.`,
          `La EPS de ${pila}${e ? ` (${e})` : ""} cubre la atención médica si ocurre un accidente o una lesión; el centro deportivo solo responde si hay dolo o culpa grave.`,
          "Si el deportista agrede a un compañero o a un profesor, el centro deportivo puede retirarlo de la clase sin devolver el dinero.",
          `Los datos de ${pila} se usan para su inscripción, el contacto con la familia, las emergencias y la facturación (Ley 1581 de 2012). Los datos de salud, las fotos y la información del centro los autorizas tú, con SÍ o NO.`,
        ];
  }
  const ee = e || "…";
  return mayor
    ? [
        "Participas voluntariamente en las actividades deportivas y estás en condiciones de salud para hacerlo.",
        "Conoces y aceptas el reglamento del centro deportivo, y asumes los riesgos propios de la práctica del deporte.",
        `Tu EPS (${ee}) cubre la atención médica si ocurre un accidente o una lesión; el centro deportivo no asume esa responsabilidad.`,
        "Si agredes a un compañero o a un profesor, el centro deportivo puede retirarte de la clase sin devolver el dinero.",
        "Autorizas el tratamiento de tus datos personales y el uso de tus fotos y videos en la página web y las redes sociales del centro deportivo (Ley 1581 de 2012).",
      ]
    : [
        `${n} participa voluntariamente en las actividades deportivas y está en condiciones de salud para hacerlo.`,
        "Conoces y aceptas el reglamento del centro deportivo, y asumes los riesgos propios de la práctica del deporte.",
        `La EPS de ${pila} (${ee}) cubre la atención médica si ocurre un accidente o una lesión; el centro deportivo no asume esa responsabilidad.`,
        "Si el deportista agrede a un compañero o a un profesor, el centro deportivo puede retirarlo de la clase sin devolver el dinero.",
        `Autorizas el tratamiento de los datos personales de ${pila} y el uso de sus fotos y videos en la página web y las redes sociales del centro deportivo (Ley 1581 de 2012).`,
      ];
}
