import { z } from "zod";
import { MAX_POR_LINEA } from "@/lib/cafeteria/pedido";

/** El precio se escribe en pesos, sin decimales. Vacío = 0 = "todavía sin precio". */
const precio = z.preprocess(
  (v) => (typeof v === "string" ? v.replace(/[.\s$]/g, "") : v),
  z.coerce
    .number({ message: "Escribe el precio en pesos." })
    .int("El precio va en pesos, sin decimales.")
    .min(0, "El precio no puede ser negativo.")
    .max(5_000_000, "Ese precio parece un error."),
);

export const productoSchema = z.object({
  nombre: z.string().trim().min(2, "Escribe el nombre del producto.").max(80, "Máximo 80 letras."),
  categoriaId: z.coerce.number({ message: "Elige una categoría." }).int().positive("Elige una categoría."),
  precio,
  descripcion: z.string().trim().max(200, "Máximo 200 letras.").optional().or(z.literal("")),
  // Las opciones llegan en un solo campo separadas por coma; se parten con `leerOpciones`.
  opciones: z.string().trim().max(300, "Demasiadas opciones.").optional().or(z.literal("")),
});

export const productoEditarSchema = productoSchema.extend({
  id: z.coerce.number().int().positive(),
});

export const categoriaSchema = z.object({
  nombre: z.string().trim().min(2, "Escribe el nombre de la categoría.").max(40, "Máximo 40 letras."),
});

/** Indicativo + número, solo dígitos. Vacío = sin número (WhatsApp deja escoger el contacto). */
export const whatsappSchema = z.object({
  whatsapp: z.preprocess(
    (v) => (typeof v === "string" ? v.replace(/[\s+()-]/g, "") : v),
    z.string().regex(/^(\d{10,15})?$/, "Escribe el número con indicativo y solo dígitos, p. ej. 573001234567."),
  ),
});

/** Lo que manda el celular al registrar un pedido. El total NO viaja: lo calcula el servidor. */
export const pedidoSchema = z.object({
  codigo: z.string().regex(/^[A-Z0-9]{4}$/),
  lineas: z
    .array(
      z.object({
        productoId: z.number().int().positive(),
        opcion: z.string().max(60).optional(),
        cantidad: z.number().int().min(1).max(MAX_POR_LINEA),
      }),
    )
    .min(1)
    .max(60),
  datos: z.object({
    nombre: z.string().trim().min(1).max(80),
    ubicacion: z.string().trim().min(1).max(80),
    detalleUbicacion: z.string().trim().max(120),
    notas: z.string().trim().max(300),
  }),
});
