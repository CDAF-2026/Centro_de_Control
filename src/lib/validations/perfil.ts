import { z } from "zod";

/** Datos que cada quien puede cambiar de sí mismo. El rol NO está aquí a propósito. */
export const datosPerfilSchema = z.object({
  nombre: z.string().trim().min(2, "Escribe tu nombre"),
  telefono: z.string().trim().optional(),
});

export const cambiarCorreoSchema = z.object({
  email: z.string().trim().email("Correo inválido"),
  password: z.string().min(1, "Escribe tu contraseña actual"),
});

export const cambiarPasswordSchema = z
  .object({
    actual: z.string().min(1, "Escribe tu contraseña actual"),
    nueva: z.string().min(8, "Mínimo 8 caracteres"),
    repetir: z.string().min(1, "Repite la contraseña nueva"),
  })
  .refine((d) => d.nueva === d.repetir, {
    message: "Las dos contraseñas no coinciden",
    path: ["repetir"],
  });

/** Contraseña que el superadministrador le asigna a otra persona. */
export const asignarPasswordSchema = z.object({
  id: z.string().uuid(),
  password: z.string().min(8, "Mínimo 8 caracteres"),
});

export const FOTO_MAX_BYTES = 2 * 1024 * 1024;
export const FOTO_TIPOS = ["image/jpeg", "image/png", "image/webp"];
