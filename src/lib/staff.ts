import { createClient } from "@/lib/supabase/server";
import type { AppRole, StaffMiembro } from "@/lib/database.types";

/**
 * Directorio del staff.
 *
 * Leer `profiles` directamente NO sirve para la mayoría del equipo: la política
 * `profiles_select` (migración 0001) solo deja ver el propio perfil salvo a
 * superadmin / coord. administrativo, así que a recepción, coord. deportivo y
 * profesores los selectores les saldrían vacíos. Esta función pasa por el RPC
 * `staff_directorio()`, que expone solo nombre, rol y estado — nunca documento
 * ni teléfono (ver migración 0046).
 */
export async function listarStaff(opts?: {
  /** Por defecto solo activos: es lo que quiere un selector. */
  soloActivos?: boolean;
  role?: AppRole;
}): Promise<StaffMiembro[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("staff_directorio", {
    p_solo_activos: opts?.soloActivos ?? true,
    p_role: opts?.role ?? null,
  });
  return data ?? [];
}

/**
 * Quién puede dictar clases. Va por el RPC `staff_docentes` (migración 0061) y
 * NO por el rol: el rol dice qué ve la persona en la app, las reglas de
 * `profesor_regla` dicen cómo se le paga, y son dos cosas distintas. Willington
 * es coordinador deportivo y da las clases de las 7 a.m.; filtrando por rol
 * desaparecía de los selectores y sus clases no se le podían asignar.
 */
async function listarDocentes(soloActivos = true): Promise<StaffMiembro[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("staff_docentes", { p_solo_activos: soloActivos });
  return data ?? [];
}

/** Profesores que se pueden asignar hoy (selectores de clases, eventos, academias). */
export async function profesoresActivos(): Promise<{ id: string; nombre: string | null }[]> {
  const staff = await listarDocentes();
  return staff.map((p) => ({ id: p.id, nombre: p.nombre }));
}

/**
 * Profesores para filtrar listados históricos. Incluye a los inactivos: quien
 * ya no trabaja aquí pudo haber dado las clases que se están consultando.
 */
export async function profesoresParaFiltrar(): Promise<
  { id: string; nombre: string | null; activo: boolean }[]
> {
  const staff = await listarDocentes(false);
  return staff.map((p) => ({ id: p.id, nombre: p.nombre, activo: p.activo }));
}

/**
 * Mapa id → nombre de todo el staff (activo o no), para pintar el nombre del
 * profesor en registros ya guardados.
 */
export async function mapaNombresStaff(): Promise<Map<string, string>> {
  const staff = await listarStaff({ soloActivos: false });
  return new Map(staff.map((p) => [p.id, p.nombre ?? "—"]));
}

/** Nombre de un miembro del staff por id (o null si no existe). */
export async function nombreStaff(id: string | null): Promise<string | null> {
  if (!id) return null;
  const mapa = await mapaNombresStaff();
  return mapa.get(id) ?? null;
}

/** Staff activo para etiquetar con @ en las notas, sin incluirse a sí mismo. */
export async function staffDirectorio(excluir?: string): Promise<StaffMiembro[]> {
  const staff = await listarStaff();
  return staff.filter((p) => p.id !== excluir);
}
