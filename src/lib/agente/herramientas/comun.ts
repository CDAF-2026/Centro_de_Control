import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * Lo que comparten las herramientas del agente.
 *
 * Una herramienta es una pregunta que la plataforma ya sabe responder bien: llama a
 * los MISMOS cálculos que usan las pantallas (RPC de Siigo, liquidación, horas…),
 * así el agente y el dashboard nunca se contradicen. El modelo solo escoge cuál y
 * con qué fechas; la cifra la pone la base.
 */

export type Contexto = {
  /** La sesión del superadministrador (o service_role en el banco de preguntas). */
  supabase: SupabaseClient<Database>;
  /** Hoy en Colombia, YYYY-MM-DD. */
  hoy: string;
};

export type Resultado = {
  datos: unknown;
  /** De dónde salió, en palabras de la pantalla ("Facturas de Siigo"). */
  fuente: string;
  /** Las fechas que cubre, si aplica. */
  periodo?: string;
};

export type Herramienta<E extends z.ZodObject = z.ZodObject> = {
  nombre: string;
  /** Lo que ve la persona mientras el agente consulta ("Consultando la cartera…"). */
  etiqueta: string;
  descripcion: string;
  esquema: E;
  /** Solo para el modelo de análisis (la consulta libre y su esquema). */
  soloAnalisis?: boolean;
  ejecutar: (ctx: Contexto, args: z.infer<E>) => Promise<Resultado>;
};

/** Ayuda a TypeScript a inferir los argumentos de cada herramienta. */
export function herramienta<E extends z.ZodObject>(h: Herramienta<E>): Herramienta<E> {
  return h;
}

export const FECHA = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe("Fecha YYYY-MM-DD (hora de Colombia).");

/** Error que el modelo puede leer y corregir (fechas al revés, servicio que no existe…). */
export class ErrorDeUso extends Error {}

export function validarRango(desde: string, hasta: string, maxDias = 400): void {
  if (desde > hasta) throw new ErrorDeUso(`"desde" (${desde}) es posterior a "hasta" (${hasta}).`);
  const dias = (Date.parse(hasta) - Date.parse(desde)) / 86_400_000 + 1;
  if (dias > maxDias) throw new ErrorDeUso(`El rango es de ${dias} días; el máximo aquí es ${maxDias}.`);
}

export const periodoTexto = (desde: string, hasta: string) => (desde === hasta ? desde : `${desde} a ${hasta}`);

/** Sin tildes y en minúscula, para comparar nombres escritos por personas. */
export function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export type Servicio = { id: number; nombre: string; clave: string };

export async function listarServicios(ctx: Contexto): Promise<Servicio[]> {
  const { data, error } = await ctx.supabase.from("servicios").select("id, nombre, clave").order("orden");
  if (error) throw new Error(`No se pudieron leer las categorías: ${error.message}`);
  return data ?? [];
}

/**
 * Un servicio por su nombre ("cafeteria", "Clases de pádel", "academia recreativa tenis").
 * Primero exacto, luego que lo contenga. Si no hay uno solo, le devuelve al modelo la
 * lista para que escoja: adivinar aquí movería la cifra a otra categoría en silencio.
 */
export function resolverServicio(servicios: Servicio[], texto: string): Servicio {
  const t = normalizar(texto);
  const exacto = servicios.filter((s) => normalizar(s.nombre) === t || normalizar(s.clave) === t);
  if (exacto.length === 1) return exacto[0];
  const contiene = servicios.filter((s) => normalizar(s.nombre).includes(t));
  if (contiene.length === 1) return contiene[0];
  const opciones = servicios.map((s) => s.nombre).join(", ");
  throw new ErrorDeUso(
    contiene.length > 1
      ? `"${texto}" coincide con varias categorías (${contiene.map((s) => s.nombre).join(", ")}). Escoge una.`
      : `No hay una categoría "${texto}". Las categorías son: ${opciones}.`,
  );
}

/** Lanza el error de una consulta a la base con un mensaje legible. */
export function revisar<T>(r: { data: T; error: { message: string } | null }, que: string): T {
  if (r.error) throw new Error(`No se pudo consultar ${que}: ${r.error.message}`);
  return r.data;
}

export async function mapaNombresPerfiles(ctx: Contexto): Promise<Map<string, string>> {
  const filas = revisar(await ctx.supabase.from("profiles").select("id, nombre"), "el personal");
  return new Map((filas ?? []).map((p) => [p.id, p.nombre ?? "Sin nombre"]));
}

/** Aviso del rezago de Siigo cuando el periodo toca hoy o ayer. */
export function avisoRezago(hasta: string, hoy: string): string | undefined {
  const ayer = new Date(Date.parse(`${hoy}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  return hasta >= ayer
    ? "Siigo carga las facturas con cerca de un día de rezago: hoy y ayer pueden estar incompletos."
    : undefined;
}
