import { z } from "zod";

/**
 * Validación del camino público. Todo se valida en el SERVIDOR: la página no tiene
 * sesión ni rol, así que lo único que la protege es esto, el rate limit y los RPC.
 * Tamaños máximos en todo, para que un envío no pueda ser un archivo disfrazado.
 */

const texto = (max: number) => z.string().trim().max(max);
const soloDigitos = (max: number) =>
  z.string().trim().transform((s) => s.replace(/\D/g, "")).pipe(z.string().min(5, "Número demasiado corto").max(max));

/** La imagen de la firma: PNG en base64, tope 150 KB (una firma real pesa 10–40 KB). */
export const firmaPngSchema = z
  .string()
  .regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/, "Firma inválida")
  .refine((s) => s.length < 150 * 1024 * 1.4, "La firma es demasiado grande");

/** Identificación + firma del consentimiento (R5, R10). */
export const consentimientoSchema = z.object({
  // Honeypot: un humano no lo ve; un robot lo llena.
  sitio_web: z.string().max(200).optional(),

  // El menor (o la persona misma si ya tiene 18)
  nombres: texto(80).min(2, "Escribe el nombre"),
  apellidos: texto(80).min(2, "Escribe los apellidos"),
  tipoDocumento: z.enum(["RC", "TI", "CC", "CE", "PP", "PPT"]),
  documento: soloDigitos(20),
  fechaNacimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
  eps: texto(80).min(2, "Escribe la EPS"),
  rh: z.enum(["", "O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"]).optional(),

  // Quien firma (vacío cuando firma por sí mismo; el servidor lo completa)
  firmanteNombre: texto(120).optional(),
  firmanteDocumento: z.string().trim().max(20).optional(),
  firmanteParentesco: texto(40).optional(),
  firmanteCelular: texto(20).optional(),
  firmanteEmail: z.string().trim().max(120).email("Correo inválido").optional().or(z.literal("")),

  // "Confirmo que el documento y el nombre son correctos": solo aparece al segundo intento
  // cuando el documento coincide con alguien de otro nombre (ver match.ts).
  confirmoDocumento: z.string().max(5).optional(),
  acepto: z.literal("on", { message: "Debes aprobar el consentimiento" }),
  metodo: z.enum(["dibujada", "escrita"]),
  firmaPng: firmaPngSchema,
});

export type ConsentimientoInput = z.infer<typeof consentimientoSchema>;

/** Convierte los issues de zod en {campo: mensaje} para pintar bajo cada input. */
export function erroresDeCampo(issues: z.ZodIssue[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of issues) out[String(i.path[0] ?? "_")] ??= i.message;
  return out;
}

/** Un acudiente del formulario de datos (padre, madre u otro). */
const acudienteSchema = {
  rol: z.enum(["padre", "madre", "otro"]).optional(),
  nombre: texto(120).optional(),
  documento: z.string().trim().max(20).optional(),
  telefono: texto(20).optional(),
  email: z.string().trim().max(120).email("Correo inválido").optional().or(z.literal("")),
  parentesco: texto(40).optional(),
};

/**
 * El formulario "Actualizar o ingresar datos" (R2, plan §4.4): la ficha unificada
 * completa. Lo obligatorio se decide aquí y no en el navegador. Con 18 o más años
 * (D11) no se exigen acudientes: la persona es su propio contacto.
 */
export const datosSchema = z.object({
  sitio_web: z.string().max(200).optional(),
  confirmoDocumento: z.string().max(5).optional(),
  acepto_datos: z.literal("on", { message: "Debes autorizar el tratamiento de datos" }),

  // Deportista
  nombres: texto(80).min(2, "Escribe el nombre"),
  apellidos: texto(80).min(2, "Escribe los apellidos"),
  tipoDocumento: z.enum(["RC", "TI", "CC", "CE", "PP", "PPT"]),
  documento: soloDigitos(20),
  fechaNacimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
  lugarNacimiento: texto(80).optional(),
  eps: texto(80).min(2, "Escribe la EPS"),
  rh: z.enum(["", "O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"]).optional(),

  // Familia
  direccion: texto(160).optional(),
  celular: texto(20).optional(),
  email: z.string().trim().max(120).email("Correo inválido").optional().or(z.literal("")),
  emergenciaNombre: texto(120).optional(),
  emergenciaCelular: texto(20).optional(),
  emergenciaParentesco: texto(40).optional(),

  // Acudiente principal (quien diligencia y firma) y segundo acudiente
  acudienteRol: acudienteSchema.rol,
  acudienteNombre: acudienteSchema.nombre,
  acudienteDocumento: acudienteSchema.documento,
  acudienteTelefono: acudienteSchema.telefono,
  acudienteEmail: acudienteSchema.email,
  acudienteParentesco: acudienteSchema.parentesco,
  acudiente2Rol: acudienteSchema.rol,
  acudiente2Nombre: acudienteSchema.nombre,
  acudiente2Documento: acudienteSchema.documento,
  acudiente2Telefono: acudienteSchema.telefono,
  acudiente2Email: acudienteSchema.email,
  acudiente2Parentesco: acudienteSchema.parentesco,

  // Facturación: OBLIGATORIA (Laura, 1-oct-2026). Lo que puede elegir el papá es de
  // quién se toman los datos (el acudiente, él mismo si es mayor, u otra persona o
  // empresa); la pantalla copia los del acudiente a estos campos, y aquí se exige que
  // lleguen llenos vengan de donde vengan. "mantener" = la ficha YA tiene facturación y
  // el papá no quiere cambiarla (Laura, 2-oct-2026): no viajan datos y el servidor
  // comprueba que de verdad la tenga.
  facturaDe: z.enum(["mantener", "acudiente", "propio", "otro"], { message: "Elige a nombre de quién salen las facturas" }),
  facturaTipo: z.enum(["natural", "juridica"], { message: "Elige el tipo" }).optional(),
  facturaANombre: texto(160).optional(),
  facturaANit: z.string().trim().max(30).optional(),
  facturaEmail: z.string().trim().max(120).optional(),
}).superRefine((d, ctx) => {
  if (d.facturaDe === "mantener") return;
  if (!d.facturaTipo) ctx.addIssue({ code: "custom", path: ["facturaTipo"], message: "Elige el tipo" });
  if (!d.facturaANombre || d.facturaANombre.length < 2) ctx.addIssue({ code: "custom", path: ["facturaANombre"], message: "Escribe el nombre o la razón social" });
  if ((d.facturaANit ?? "").replace(/\D/g, "").length < 5) ctx.addIssue({ code: "custom", path: ["facturaANit"], message: "Escribe el NIT o la cédula" });
  if (!d.facturaEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.facturaEmail)) ctx.addIssue({ code: "custom", path: ["facturaEmail"], message: "Escribe un correo válido para las facturas" });
});

export type DatosInput = z.infer<typeof datosSchema>;
