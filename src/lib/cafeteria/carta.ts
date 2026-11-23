import type { AppRole } from "@/lib/database.types";

/**
 * Tipos y reglas de la carta de la cafetería que comparten el panel
 * (`/cafeteria`), la carta pública (`/carta`) y el servidor. Sin nada que toque
 * la base: se puede importar desde un componente de cliente.
 */

/** Un producto tal como lo ve el comprador. */
export type ProductoCarta = {
  id: number;
  nombre: string;
  descripcion: string | null;
  /** Pesos colombianos. En la carta pública siempre es > 0. */
  precio: number;
  /** Variantes que hay que escoger (Milo: Frío / Caliente). Vacío = sin variantes. */
  opciones: string[];
  fotoUrl: string | null;
};

export type CategoriaCarta = { id: number; nombre: string; productos: ProductoCarta[] };

/** Un producto tal como lo ve quien administra: con lo que el comprador no ve. */
export type ProductoAdmin = ProductoCarta & {
  categoriaId: number;
  disponible: boolean;
  fotoPath: string | null;
};

export type CategoriaAdmin = { id: number; nombre: string; orden: number };

/**
 * Quién cambia el WhatsApp a donde llegan los pedidos. Es más estrecho que
 * administrar la carta: un número mal escrito manda los pedidos a un
 * desconocido. La política `cafeteria_ajustes_update` dice lo mismo en la base.
 * Regla de DENTRO del módulo, como `PUEDE_REABRIR_EVENTO`.
 */
export const PUEDE_CAMBIAR_WHATSAPP: AppRole[] = ["superadmin", "coord_admin"];

/** Topes de la foto de un producto. El bucket `cafeteria` exige lo mismo. */
export const FOTO_TIPOS = ["image/jpeg", "image/png", "image/webp"];
export const FOTO_MAX_MB = 5;
export const FOTO_MAX_BYTES = FOTO_MAX_MB * 1024 * 1024;
/** Lado mayor al que el navegador reduce la foto antes de subirla. */
export const FOTO_LADO_MAX = 1400;

/**
 * URL pública de la foto de un producto. En la base se guarda la RUTA dentro del
 * bucket `cafeteria` (no la URL), igual que con los avatares.
 */
export function fotoUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/cafeteria/${path}`;
}

/**
 * "Frío, Caliente" → ["Frío", "Caliente"]. Las opciones se escriben en un solo
 * campo separadas por coma; aquí se limpian y se quitan las repetidas.
 */
export function leerOpciones(texto: string | null | undefined): string[] {
  const vistas = new Set<string>();
  const salida: string[] = [];
  for (const parte of (texto ?? "").split(",")) {
    const opcion = parte.trim().replace(/\s+/g, " ");
    const clave = opcion.toLowerCase();
    if (!opcion || vistas.has(clave)) continue;
    vistas.add(clave);
    salida.push(opcion);
  }
  return salida;
}
