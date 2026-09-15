import { createClient } from "@/lib/supabase/server";
import type { AppRole, Deporte, StaffDocente, StaffMiembro } from "@/lib/database.types";

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
async function listarDocentes(soloActivos = true): Promise<StaffDocente[]> {
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

/** Una opción del selector de profesor de una clase. */
export type OpcionProfesor = {
  id: string;
  nombre: string;
  /** false = no tiene deporte marcado; va en su propio grupo, nunca se esconde. */
  delDeporte: boolean;
};

/** Docentes activos con sus deportes, para armar selectores (migración 0089). */
export async function docentesConDeporte(): Promise<StaffDocente[]> {
  return listarDocentes();
}

/**
 * Profesores que se le pueden asignar a una clase de `deporte`.
 *
 * Trae PRIMERO a los que dictan ese deporte y DESPUÉS a los que no tienen
 * deporte marcado (migración 0089). A los del otro deporte no los ofrece: el
 * club pidió que una clase de pádel liste profesores de pádel.
 *
 * ⚠️ Los "sin marcar" NO se esconden a propósito. Si se filtrara estricto, un
 * profesor al que nadie le marcó el deporte simplemente no existiría en el
 * selector y no habría forma de entender por qué — el fallo callado que este
 * proyecto ya ha pagado varias veces. Apareciendo aparte, el hueco se ve y se
 * arregla en la ficha del empleado.
 *
 * `deporte` en null (clase sin deporte) = se ofrecen todos, sin separar.
 *
 * Es una función PURA y recibe la lista ya cargada: el calendario pinta un mes
 * entero y pedir los docentes una vez por clase serían decenas de consultas
 * idénticas.
 */
export function opcionesParaDeporte(
  docentes: StaffDocente[],
  deporte: Deporte | null,
): OpcionProfesor[] {
  return docentes
    .map((p) => ({
      id: p.id,
      nombre: p.nombre ?? "—",
      // Sin deporte en la clase no hay nada contra qué comparar: todos cuentan
      // como "del deporte" para que salgan en un solo grupo.
      delDeporte: !deporte || (p.deportes ?? []).includes(deporte),
      sinMarcar: (p.deportes ?? []).length === 0,
    }))
    .filter((p) => p.delDeporte || p.sinMarcar)
    // Los del deporte arriba; dentro de cada grupo se conserva el orden por
    // nombre que ya trae el RPC (sort estable).
    .sort((a, b) => Number(b.delDeporte) - Number(a.delDeporte))
    .map(({ id, nombre, delDeporte }) => ({ id, nombre, delDeporte }));
}
