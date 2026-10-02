/**
 * Mayúscula inicial en nombres de persona escritos por el público (Laura, 2-oct-2026):
 * "laura salazar" → "Laura Salazar", "MARÍA DE LOS ÁNGELES" → "María de los Ángeles".
 * Las partículas (de, del, la, los, las, y, e, van, von, da, di) van en minúscula salvo al
 * inicio. Los guiones y apóstrofos se respetan ("Ana-María", "D'Alessandro"). Sin
 * `server-only`: es lógica pura con pruebas.
 */
const PARTICULAS = new Set(["de", "del", "la", "las", "los", "y", "e", "van", "von", "da", "di", "do", "dos", "das"]);

export function capitalizarNombre(s: string | null | undefined): string {
  const limpio = (s ?? "").trim().replace(/\s+/g, " ");
  if (!limpio) return "";
  return limpio
    .split(" ")
    .map((palabra, i) => {
      const baja = palabra.toLocaleLowerCase("es");
      if (i > 0 && PARTICULAS.has(baja)) return baja;
      return baja
        .split(/([-'’])/)
        .map((trozo) => (trozo.length && !/[-'’]/.test(trozo) ? trozo[0].toLocaleUpperCase("es") + trozo.slice(1) : trozo))
        .join("");
    })
    .join(" ");
}
