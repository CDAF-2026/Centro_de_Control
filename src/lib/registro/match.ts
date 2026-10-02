import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * Encontrar al NIÑO de una solicitud pública (consentimiento o datos).
 *
 * Reglas (plan §4.5), en orden:
 *  1. Documento (solo dígitos) en `cliente_miembros`. ⚠️ `documento` NO es único en la base
 *     (medido): en los datos reales hay hermanos con el mismo número (Matías/Elena Restrepo),
 *     así que con más de un resultado se desempata por NOMBRE normalizado — que es justo lo
 *     que el consentimiento trae escrito. Si aun así quedan dos (una ficha duplicada), AMBIGUO.
 *     ⚠️ Y si el documento coincide pero el NOMBRE no se parece a NINGUNO de los que lo tienen,
 *     es DOCUMENTO_AJENO (Laura, 2-oct-2026): casi siempre es el papá escribiendo su propia
 *     cédula en el campo del niño. Antes se aceptaba y D1 le sobrescribía al papá el nombre y
 *     la fecha de nacimiento con los del niño. Ahora nunca se escribe sobre esa coincidencia:
 *     la página lo frena y, si insiste confirmando, va a la bandeja sin tocar nada.
 *  2. Nombre normalizado + fecha de nacimiento exacta.
 *  3. Nada → NINGUNO (la página lo manda a llenar datos; nunca dice "no existes" con datos ajenos).
 *
 * Es una sola copia a propósito: la usan el consentimiento (Fase 2) y el formulario de datos
 * (Fase 3). Una segunda normalización de nombres ya partió a un profesor en dos (MEMORIA).
 */
export type Candidato = {
  miembro_id: number;
  cliente_id: number;
  nombres: string;
  apellidos: string;
  documento: string | null;
  fecha_nacimiento: string | null;
  es_titular: boolean;
};

export type ResultadoBusqueda =
  | { tipo: "unico"; miembro: Candidato; por: "documento" | "documento+nombre" | "nombre+fecha" }
  | { tipo: "ambiguo"; candidatos: Candidato[] }
  | { tipo: "documento_ajeno"; candidatos: Candidato[] }
  | { tipo: "ninguno" };

/**
 * Minúsculas, sin tildes, sin signos, un solo espacio. "SIMÓN  Vélez" → "simon velez".
 * La ñ también cae a n (NFD la parte en n + virgulilla): da igual, porque se
 * normalizan los DOS lados de la comparación; lo que importa es que "Ñeque" y
 * "Neque" casen entre sí.
 */
export function normalizarNombre(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Solo dígitos. "1.037.607-268" → "1037607268". Menos de 5 dígitos no es un documento. */
export function soloDigitos(s: string | null | undefined): string | null {
  const d = (s ?? "").replace(/\D/g, "");
  return d.length >= 5 ? d : null;
}

/**
 * Desempate por nombre entre candidatos que comparten documento. Casa si el nombre
 * completo normalizado coincide, o si coinciden el primer nombre y el primer apellido
 * ("Simon Velez" ↔ "SIMÓN ANDRÉS VÉLEZ GÓMEZ"). Lógica pura, con pruebas.
 */
export function desempatarPorNombre(candidatos: Candidato[], nombres: string, apellidos: string): Candidato[] {
  const n = normalizarNombre(nombres);
  const a = normalizarNombre(apellidos);
  if (!n || !a) return candidatos;
  const completo = `${n} ${a}`;
  const exactos = candidatos.filter((c) => `${normalizarNombre(c.nombres)} ${normalizarNombre(c.apellidos)}` === completo);
  if (exactos.length) return exactos;
  const n1 = n.split(" ")[0];
  const a1 = a.split(" ")[0];
  return candidatos.filter(
    (c) => normalizarNombre(c.nombres).split(" ")[0] === n1 && normalizarNombre(c.apellidos).split(" ")[0] === a1,
  );
}

const CAMPOS = "id, cliente_id, nombres, apellidos, documento, fecha_nacimiento, es_titular";
type Fila = { id: number; cliente_id: number; nombres: string; apellidos: string; documento: string | null; fecha_nacimiento: string | null; es_titular: boolean };
const aCandidato = (f: Fila): Candidato => ({
  miembro_id: f.id, cliente_id: f.cliente_id, nombres: f.nombres, apellidos: f.apellidos,
  documento: f.documento, fecha_nacimiento: f.fecha_nacimiento, es_titular: f.es_titular,
});

export async function buscarMiembro(
  supabase: SupabaseClient<Database>,
  datos: { documento?: string | null; nombres: string; apellidos: string; fechaNacimiento?: string | null },
): Promise<ResultadoBusqueda> {
  // 1. Documento
  const doc = soloDigitos(datos.documento);
  if (doc) {
    const { data } = await supabase.from("cliente_miembros").select(CAMPOS).eq("documento", doc).eq("activo", true).limit(20);
    const cands = (data ?? []).map(aCandidato);
    if (cands.length) {
      const d = desempatarPorNombre(cands, datos.nombres, datos.apellidos);
      if (d.length === 0) return { tipo: "documento_ajeno", candidatos: cands };
      if (d.length === 1) return { tipo: "unico", miembro: d[0], por: cands.length === 1 ? "documento" : "documento+nombre" };
      return { tipo: "ambiguo", candidatos: d };
    }
  }

  // 2. Nombre + fecha de nacimiento
  if (datos.fechaNacimiento) {
    const { data } = await supabase
      .from("cliente_miembros")
      .select(CAMPOS)
      .eq("fecha_nacimiento", datos.fechaNacimiento)
      .eq("activo", true)
      .limit(50);
    const d = desempatarPorNombre((data ?? []).map(aCandidato), datos.nombres, datos.apellidos);
    if (d.length === 1) return { tipo: "unico", miembro: d[0], por: "nombre+fecha" };
    if (d.length > 1) return { tipo: "ambiguo", candidatos: d };
  }

  return { tipo: "ninguno" };
}
