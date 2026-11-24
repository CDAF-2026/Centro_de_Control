import { z } from "zod";
import { ErrorDeUso, herramienta, revisar } from "./comun";

/**
 * La consulta libre (solo el modelo de análisis). Corre por `agente_consulta`:
 * solo lectura, como el rol `agente_lectura`, solo sobre las vistas del esquema
 * `agente`, 200 filas como máximo y 8 s con la sesión del superadministrador
 * (migración 20261124101000).
 *
 * ⚠️ La lista de vistas de la descripción se escribe a mano: si una migración agrega
 * o quita una vista del esquema `agente`, hay que cambiarla aquí también.
 */

const VISTAS = [
  "clientes, cliente_miembros, acudientes, cliente_facturacion_extra, cliente_documentos, consentimiento_firma, consentimiento_version, registro_cambio",
  "academias, clase_semanal (el planeador), inscripciones, inscripcion_clase, academia_pausa, clases, asistencias, lista_espera, festivo",
  "paquetes_catalogo, paquetes_cliente",
  "eventos, evento_participantes, evento_profesores, evento_gastos",
  "servicios, siigo_facturas, siigo_factura_lineas, siigo_productos, siigo_sync",
  "profiles (personal), profesor_regla, easycancha_profesor_alias, turno, turno_pausa, empleado_documentos",
  "cafeteria_categorias, cafeteria_productos, cafeteria_pedidos",
  "notas, nota_destinatarios, nota_comentarios",
].join("; ");

export const describirTablas = herramienta({
  nombre: "describir_tablas",
  etiqueta: "Revisando cómo están organizados los datos…",
  soloAnalisis: true,
  descripcion:
    "Columnas, tipos y explicación de las tablas que puede leer consulta_libre. Úsala antes de escribir una consulta sobre tablas cuyas columnas no conoces. " +
    `Tablas: ${VISTAS}.`,
  esquema: z.object({
    tablas: z.array(z.string().regex(/^[a-z_]+$/)).min(1).max(15),
  }),
  async ejecutar(ctx, a) {
    // Los nombres ya vienen validados (solo letras y guion bajo) y la consulta corre
    // de todos modos como el rol de solo lectura.
    // ⚠️ Sin punto y coma en NINGUNA parte del texto, ni dentro de una cadena: la puerta
    // de la consulta libre rechaza cualquier ";" (24-nov-2026, el banco lo cazó con el
    // separador de columnas).
    const lista = a.tablas.map((t) => `'${t}'`).join(", ");
    const sql = `
      select c.relname as tabla,
             obj_description(c.oid, 'pg_class') as explicacion,
             string_agg(a.attname || ' ' || format_type(a.atttypid, a.atttypmod)
                        || coalesce(' — ' || col_description(c.oid, a.attnum), ''), ' | ' order by a.attnum) as columnas
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'agente'
      join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
      where c.relname in (${lista})
      group by c.oid, c.relname`;
    const filas = revisar(await ctx.supabase.rpc("agente_consulta", { p_sql: sql }), "las tablas")?.filas ?? [];
    const encontradas = new Set(filas.map((f) => (f as { tabla: string }).tabla));
    const faltan = a.tablas.filter((t) => !encontradas.has(t));
    return {
      datos: { tablas: filas, ...(faltan.length ? { no_existen: faltan } : {}) },
      fuente: "Estructura de los datos",
    };
  },
});

export const consultaLibre = herramienta({
  nombre: "consulta_libre",
  etiqueta: "Consultando la base de datos…",
  soloAnalisis: true,
  descripcion:
    "Una consulta SQL de SOLO LECTURA (PostgreSQL) para lo que las otras herramientas no cubren (p. ej. niños que dejaron de venir, clases por franja horaria, " +
    "clientes que compran una cosa y no otra). Reglas: una sola sentencia SELECT o WITH … SELECT, sin punto y coma en medio; máximo 200 filas, así que " +
    "agrega en SQL (count, sum, group by) en vez de traer filas sueltas; tarda máximo 8 s; nombra cada columna calculada con alias. " +
    "Las fechas *_at y *_el son timestamptz en UTC: conviértelas con (x at time zone 'America/Bogota'). " +
    "Para cifras de dinero que ya dan ingresos, cartera, ticket o productos_vendidos, usa esas herramientas: no recalcules. " +
    `Tablas disponibles (sin esquema): ${VISTAS}. Si no conoces las columnas, usa primero describir_tablas.`,
  esquema: z.object({
    sql: z.string().min(8).max(8000),
    para_que: z.string().max(200).describe("En una frase, qué buscas con esta consulta."),
  }),
  async ejecutar(ctx, a) {
    const { data, error } = await ctx.supabase.rpc("agente_consulta", { p_sql: a.sql });
    if (error) {
      // El modelo puede corregir su propia consulta: se le devuelve el error tal cual.
      throw new ErrorDeUso(error.message.includes("statement timeout")
        ? "La consulta tardó más de 8 segundos. Simplifícala o agrega en SQL."
        : `La base rechazó la consulta: ${error.message}`);
    }
    return { datos: data, fuente: `Consulta a la base: ${a.para_que}` };
  },
});
