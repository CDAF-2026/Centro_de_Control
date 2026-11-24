import { z } from "zod";
import type OpenAI from "openai";
import type { Ruta } from "../costo";
import { ErrorDeUso, type Contexto, type Herramienta } from "./comun";
import { cartera, comprasJuntas, ingresos, productosVendidos, ticket } from "./dinero";
import { clienteBuscar, clienteDetalle, clientesResumen } from "./clientes";
import { academias, cafeteriaPedidos, clases, eventos, ocupacion, paquetes } from "./operacion";
import { horasPersonal, liquidacion, notas, personal } from "./personal";
import { consultaLibre, describirTablas } from "./consulta";

export type { Contexto } from "./comun";

export const HERRAMIENTAS: Herramienta[] = [
  ingresos,
  cartera,
  ticket,
  comprasJuntas,
  productosVendidos,
  clienteBuscar,
  clienteDetalle,
  clientesResumen,
  clases,
  academias,
  paquetes,
  eventos,
  ocupacion,
  cafeteriaPedidos,
  liquidacion,
  horasPersonal,
  personal,
  notas,
  describirTablas,
  consultaLibre,
] as Herramienta[];

/**
 * Lo que puede usar cada modelo. El de consultas NO tiene la consulta libre
 * (decisión del plan, 24-nov-2026): un modelo pequeño escogiendo una herramienta
 * oficial no puede equivocar una cifra; escribiendo SQL, sí.
 */
export function herramientasPara(ruta: Ruta): Herramienta[] {
  return ruta === "analisis" ? HERRAMIENTAS : HERRAMIENTAS.filter((h) => !h.soloAnalisis);
}

/** Definición para la API de OpenAI (modo estricto: el modelo no puede inventar argumentos). */
export function definicionOpenAI(h: Herramienta): OpenAI.Responses.FunctionTool {
  const { $schema: _omitido, ...parametros } = z.toJSONSchema(h.esquema, { target: "draft-7" }) as Record<string, unknown>;
  return { type: "function", name: h.nombre, description: h.descripcion, parameters: parametros, strict: true };
}

/** Lo que queda de cada consulta del agente: de aquí sale "Cómo lo calculé". */
export type RegistroHerramienta = {
  nombre: string;
  etiqueta: string;
  argumentos: unknown;
  ok: boolean;
  fuente?: string;
  periodo?: string;
  error?: string;
  ms: number;
};

/** Tope de lo que se le devuelve al modelo por consulta (≈ 10 mil tokens). */
export const MAX_SALIDA = 40_000;

/**
 * Corre una herramienta con los argumentos que mandó el modelo. Nunca lanza: un
 * error vuelve al modelo como texto, para que corrija (fecha al revés, categoría
 * mal escrita) o le diga a la persona qué faltó.
 */
export async function ejecutarHerramienta(
  nombre: string,
  argumentosJson: string,
  ctx: Contexto,
  disponibles: Herramienta[] = HERRAMIENTAS,
): Promise<{ salida: string; registro: RegistroHerramienta }> {
  const inicio = Date.now();
  const h = disponibles.find((x) => x.nombre === nombre);
  const base = { nombre, etiqueta: h?.etiqueta ?? nombre, argumentos: null as unknown };
  const fallo = (error: string) => ({
    salida: JSON.stringify({ error }),
    registro: { ...base, ok: false, error, ms: Date.now() - inicio },
  });
  if (!h) return fallo(`No existe la herramienta "${nombre}".`);

  let crudo: unknown;
  try {
    crudo = JSON.parse(argumentosJson);
  } catch {
    return fallo("Los argumentos no son un JSON válido.");
  }
  base.argumentos = crudo;
  const args = h.esquema.safeParse(crudo);
  if (!args.success) return fallo(`Argumentos inválidos: ${z.prettifyError(args.error)}`);

  try {
    const r = await h.ejecutar(ctx, args.data);
    let salida = JSON.stringify({ fuente: r.fuente, periodo: r.periodo, datos: r.datos });
    if (salida.length > MAX_SALIDA) {
      salida = `${salida.slice(0, MAX_SALIDA)}… [RECORTADO: el resultado era de ${salida.length} caracteres. Pide un rango más corto o un resumen.]`;
    }
    return { salida, registro: { ...base, ok: true, fuente: r.fuente, periodo: r.periodo, ms: Date.now() - inicio } };
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    // Un error de uso se le explica al modelo; uno de la base, también, pero se marca.
    return fallo(e instanceof ErrorDeUso ? mensaje : `Falló la consulta: ${mensaje}`);
  }
}
