/**
 * NIT de persona jurídica y su dígito de verificación (DV), con la fórmula de la DIAN (módulo 11).
 * Siigo guarda el NIT de las empresas SIN el DV (`customer.identification`), así que la plataforma también:
 * el DV no se almacena, se calcula para mostrarlo ("901534314-8"). Pedido de la clienta (18-oct-2026): que el
 * formulario aclare si el NIT va con o sin DV. Sin "server-only": lo usan formularios de cliente. Lógica pura.
 */
const PESOS = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];

/** El DV de un NIT (solo dígitos, sin DV). null si no hay número. */
export function dvNit(nit: string | null | undefined): number | null {
  const d = (nit ?? "").replace(/\D/g, "");
  if (!d || d.length > PESOS.length) return null;
  let suma = 0;
  for (let i = 0; i < d.length; i++) suma += Number(d[d.length - 1 - i]) * PESOS[i];
  const r = suma % 11;
  return r > 1 ? 11 - r : r;
}

/**
 * Lo que la persona escribió → el NIT sin DV. Entiende "901.534.314-8" (lo de después del guion es el DV) y
 * "9015343148" (10 dígitos cuyo último es justo el DV de los 9 primeros). Lo demás se toma como NIT sin DV.
 */
export function nitSinDv(texto: string | null | undefined): string {
  const t = (texto ?? "").trim();
  const conGuion = t.match(/^([\d.\s]+)-\s*(\d)$/);
  if (conGuion) return conGuion[1].replace(/\D/g, "");
  const d = t.replace(/\D/g, "");
  if (d.length === 10 && dvNit(d.slice(0, 9)) === Number(d[9])) return d.slice(0, 9);
  return d;
}

/**
 * "901534314-8" para mostrar. Si ya viene con el DV pegado (10 dígitos cuyo último es el DV de los 9
 * primeros, como algunos NIT que Siigo tiene así), solo se le pone el guion. Vacío si no hay número.
 */
export function nitConDv(nit: string | null | undefined): string {
  const d = (nit ?? "").replace(/\D/g, "");
  if (d.length === 10 && dvNit(d.slice(0, 9)) === Number(d[9])) return `${d.slice(0, 9)}-${d[9]}`;
  const dv = dvNit(d);
  return dv == null ? d : `${d}-${dv}`;
}
