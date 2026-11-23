import type { CategoriaCarta, ProductoCarta } from "./carta";

/**
 * El buscador de la carta del comprador (`/carta`): qué queda en la lista
 * mientras se escribe (`filtrar`) y qué se sugiere debajo del campo para
 * autocompletar (`sugerir`, pedido de Laura, 20-nov-2026). Funciones puras: la
 * carta se les pasa.
 */

/** Para buscar sin que importen las tildes ni las mayúsculas: "cafe" encuentra "Café". */
export function sinTildes(texto: string): string {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** Lo escrito, partido en palabras: "coca zero" encuentra "Coca-Cola Zero". */
function palabras(texto: string): string[] {
  return sinTildes(texto).split(/\s+/).filter(Boolean);
}

/**
 * Qué tan bien casa un nombre con lo escrito: 0 = empieza igual, 1 = alguna de
 * sus palabras empieza igual, 2 = lo contiene, `null` = no casa. Tienen que
 * estar TODAS las palabras escritas; el puesto lo decide la primera.
 */
function puesto(nombre: string, buscadas: string[]): number | null {
  const n = sinTildes(nombre);
  if (!buscadas.every((b) => n.includes(b))) return null;
  if (n.startsWith(buscadas[0])) return 0;
  return n.split(/[^a-z0-9ñ]+/).some((palabra) => palabra.startsWith(buscadas[0])) ? 1 : 2;
}

/**
 * La carta con solo lo que casa con lo escrito. Se busca en el nombre y la
 * descripción del producto; si lo escrito es el nombre de una categoría
 * ("café", "cerveza"), sale la categoría entera: nadie escribe "capuchino"
 * buscando "café". Sin nada escrito devuelve la carta tal cual.
 */
export function filtrar(categorias: CategoriaCarta[], texto: string): CategoriaCarta[] {
  const buscadas = palabras(texto);
  if (buscadas.length === 0) return categorias;
  const casa = (p: ProductoCarta) => {
    const donde = sinTildes(`${p.nombre} ${p.descripcion ?? ""}`);
    return buscadas.every((b) => donde.includes(b));
  };
  return categorias
    .map((c) => (puesto(c.nombre, buscadas) !== null ? c : { ...c, productos: c.productos.filter(casa) }))
    .filter((c) => c.productos.length > 0);
}

export type Sugerencia =
  | { tipo: "categoria"; clave: string; categoria: CategoriaCarta }
  | { tipo: "producto"; clave: string; producto: ProductoCarta };

/** Cuántas sugerencias salen como mucho: que quepan sobre el teclado del celular. */
export const MAX_SUGERENCIAS = 6;
const MAX_CATEGORIAS = 2;

/**
 * Lo que se ofrece debajo del buscador mientras se escribe: primero las
 * categorías que casan (hasta dos) y después los productos, por NOMBRE (la
 * descripción no cuenta aquí: lo sugerido tiene que parecerse a lo escrito).
 * Arriba lo que empieza igual, luego lo que tiene una palabra que empieza
 * igual, y al final lo que solo lo contiene.
 */
export function sugerir(categorias: CategoriaCarta[], texto: string): Sugerencia[] {
  const buscadas = palabras(texto);
  if (buscadas.length === 0) return [];

  const ordenar = <T extends { nombre: string }>(cosas: T[]) =>
    cosas
      .flatMap((cosa) => {
        const p = puesto(cosa.nombre, buscadas);
        return p === null ? [] : [{ cosa, p }];
      })
      .sort((a, b) => a.p - b.p || a.cosa.nombre.localeCompare(b.cosa.nombre, "es"))
      .map((x) => x.cosa);

  const deCategoria: Sugerencia[] = ordenar(categorias.filter((c) => c.productos.length > 0))
    .slice(0, MAX_CATEGORIAS)
    .map((categoria) => ({ tipo: "categoria", clave: `c${categoria.id}`, categoria }));
  const deProducto: Sugerencia[] = ordenar(categorias.flatMap((c) => c.productos)).map((producto) => ({
    tipo: "producto",
    clave: `p${producto.id}`,
    producto,
  }));

  return [...deCategoria, ...deProducto].slice(0, MAX_SUGERENCIAS);
}
