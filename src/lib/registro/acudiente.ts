/**
 * El acudiente de la página pública: qué opción ("Madre", "Padre", "Otro familiar") corresponde a lo que la
 * persona escribió como parentesco del contacto de emergencia. Lo usa el botón "Usar los datos del contacto
 * de emergencia" (pedido de la clienta, 16-oct-2026). Sin "server-only": lo usa el formulario. Lógica pura.
 */
export type RolAcudiente = "madre" | "padre" | "otro";

export function rolDesdeParentesco(parentesco: string | null | undefined): RolAcudiente {
  const t = (parentesco ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  if (/\b(mama|mami|madre|mamita)\b/.test(t)) return "madre";
  if (/\b(papa|papi|padre|papito)\b/.test(t)) return "padre";
  return "otro";
}
