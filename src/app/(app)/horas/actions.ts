"use server";

import { refresh } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { instanteBogota } from "@/lib/turnos";

export type CorregirState = { error?: string; ok?: string };

const HORA = /^\d{2}:\d{2}$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Suma un día a una fecha simple, sin pasar por zonas horarias. */
function diaSiguiente(fecha: string): string {
  const [y, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/**
 * Convierte "entrada 09:00 / salida 21:00" del día `fecha` en dos instantes.
 *
 * ⚠️ Si la salida es igual o anterior a la entrada se toma como del día
 * SIGUIENTE. Hoy nadie cruza la medianoche (el club cierra a las 9 p. m.), pero
 * sin esta regla un turno así quedaría con la salida antes de la entrada y la
 * base lo rechazaría sin que se entienda por qué. La pantalla lo advierte.
 */
function instantes(fecha: string, entrada: string, salida: string | null) {
  const inicio = instanteBogota(fecha, entrada);
  if (!salida) return { inicio, fin: null };
  const mismoDia = instanteBogota(fecha, salida);
  const fin = mismoDia > inicio ? mismoDia : instanteBogota(diaSiguiente(fecha), salida);
  return { inicio, fin };
}

/** Solo el superadministrador corrige turnos. La base lo vuelve a validar. */
async function exigeSA() {
  return requireRole(["superadmin"]);
}

/**
 * Cambia las horas de un turno y, de paso, su almuerzo.
 *
 * ⚠️ El ORDEN importa y no es intercambiable: primero se borran las pausas,
 * después se ajusta el turno, y solo entonces se vuelve a poner el almuerzo.
 * Al revés se traba solo — `turno_ajustar` rechaza dejar una pausa fuera del
 * turno, y `turno_pausa_fijar` rechaza una pausa fuera del turno ACTUAL. Con
 * las dos validaciones vivas, encoger un turno con almuerzo sería imposible.
 */
export async function corregirTurno(formData: FormData): Promise<CorregirState> {
  await exigeSA();

  const turno = Number(formData.get("turno"));
  const fecha = String(formData.get("fecha") ?? "");
  const entrada = String(formData.get("entrada") ?? "");
  const salida = String(formData.get("salida") ?? "");
  const almDesde = String(formData.get("almuerzo_desde") ?? "");
  const almHasta = String(formData.get("almuerzo_hasta") ?? "");
  const motivo = String(formData.get("motivo") ?? "").trim();

  if (!turno || !FECHA.test(fecha)) return { error: "Turno inválido." };
  if (!HORA.test(entrada)) return { error: "La hora de entrada no es válida." };
  if (salida && !HORA.test(salida)) return { error: "La hora de salida no es válida." };
  if (!motivo) return { error: "Escribe el motivo de la corrección." };
  if ((almDesde && !almHasta) || (!almDesde && almHasta)) {
    return { error: "El almuerzo necesita hora de salida y de regreso." };
  }
  if (almDesde && (!HORA.test(almDesde) || !HORA.test(almHasta))) {
    return { error: "Las horas del almuerzo no son válidas." };
  }

  const supabase = await createClient();

  // 1) Fuera las pausas que haya, para que el ajuste no choque con ellas.
  const { data: pausas } = await supabase
    .from("turno_pausa")
    .select("id")
    .eq("turno_id", turno);
  for (const p of pausas ?? []) {
    const { error } = await supabase.rpc("turno_pausa_eliminar", {
      p_pausa: p.id,
      p_motivo: motivo,
    });
    if (error) return { error: error.message };
  }

  // 2) Las horas del turno.
  const { inicio, fin } = instantes(fecha, entrada, salida || null);
  const { error: errAjuste } = await supabase.rpc("turno_ajustar", {
    p_turno: turno,
    p_inicio: inicio,
    p_fin: fin,
    p_motivo: motivo,
  });
  if (errAjuste) return { error: errAjuste.message };

  // 3) El almuerzo, ya contra el horario nuevo.
  if (almDesde) {
    const alm = instantes(fecha, almDesde, almHasta);
    const { error } = await supabase.rpc("turno_pausa_fijar", {
      p_turno: turno,
      p_inicio: alm.inicio,
      p_fin: alm.fin!,
      p_motivo: motivo,
    });
    if (error) return { error: error.message };
  }

  refresh();
  return { ok: "Turno corregido." };
}

/** Borra un turno marcado por error. Se lleva sus pausas por cascada. */
export async function eliminarTurno(formData: FormData): Promise<CorregirState> {
  await exigeSA();
  const turno = Number(formData.get("turno"));
  const motivo = String(formData.get("motivo") ?? "").trim();
  if (!turno) return { error: "Turno inválido." };
  if (!motivo) return { error: "Escribe el motivo antes de borrar." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("turno_eliminar", {
    p_turno: turno,
    p_motivo: motivo,
  });
  if (error) return { error: error.message };

  refresh();
  return { ok: "Turno borrado." };
}

/** Crea a mano un turno que nunca se marcó (se le olvidó, se fue la luz…). */
export async function agregarTurno(formData: FormData): Promise<CorregirState> {
  await exigeSA();

  const perfil = String(formData.get("perfil") ?? "");
  const fecha = String(formData.get("fecha") ?? "");
  const entrada = String(formData.get("entrada") ?? "");
  const salida = String(formData.get("salida") ?? "");
  const almDesde = String(formData.get("almuerzo_desde") ?? "");
  const almHasta = String(formData.get("almuerzo_hasta") ?? "");
  const motivo = String(formData.get("motivo") ?? "").trim();

  if (!perfil || !FECHA.test(fecha)) return { error: "Falta la fecha." };
  if (!HORA.test(entrada) || !HORA.test(salida)) {
    return { error: "Un turno agregado a mano necesita entrada y salida." };
  }
  if (!motivo) return { error: "Escribe el motivo." };

  const supabase = await createClient();
  const { inicio, fin } = instantes(fecha, entrada, salida);
  const { data: id, error } = await supabase.rpc("turno_crear_manual", {
    p_perfil: perfil,
    p_inicio: inicio,
    p_fin: fin!,
    p_motivo: motivo,
  });
  if (error) return { error: error.message };

  if (almDesde && almHasta && HORA.test(almDesde) && HORA.test(almHasta)) {
    const alm = instantes(fecha, almDesde, almHasta);
    const { error: errAlm } = await supabase.rpc("turno_pausa_fijar", {
      p_turno: id as number,
      p_inicio: alm.inicio,
      p_fin: alm.fin!,
      p_motivo: motivo,
    });
    if (errAlm) return { error: errAlm.message };
  }

  refresh();
  return { ok: "Turno agregado." };
}
