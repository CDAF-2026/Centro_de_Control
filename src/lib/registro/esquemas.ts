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
