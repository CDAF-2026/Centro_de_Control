"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { nombreStaff } from "@/lib/staff";
import { instanteClase } from "@/lib/fecha";
import { logAudit } from "@/lib/audit";
import { sendEmail } from "@/lib/email/resend";
import { claseConfirmadaEmail } from "@/lib/email/clase-confirmada";

export type CierreState = { error?: string; ok?: string };

const ESTADOS = ["realizada", "cancelada", "no_show"] as const;

// ⚠️ Antes pedía solo sesión (`requireProfile`): la pantalla /cierre sí validaba
// el rol, pero la acción no, así que cualquiera con sesión podía cerrar una
// clase — y cerrarla marca asistencia, que es lo que después se liquida.
export async function cerrarClase(
  _prev: CierreState,
  formData: FormData,
): Promise<CierreState> {
  const profile = await requireRole(rolesForModule("cierre_clase", "edit"));
  const claseId = Number(formData.get("claseId"));
  const estadoRaw = String(formData.get("estado"));
  if (!(ESTADOS as readonly string[]).includes(estadoRaw)) return { error: "Estado inválido." };
  const estado = estadoRaw as (typeof ESTADOS)[number];

  const supabase = await createClient();
  const { data: clase } = await supabase
    .from("clases")
    .select("id, tipo, profesor_id, fecha, hora_inicio, deporte, cliente_id, paquete_cliente_id")
    .eq("id", claseId)
    .single();
  if (!clase) return { error: "Clase no encontrada." };

  // Quién llega hasta aquí ya lo filtró `requireRole` de arriba. Lo que queda por
  // decidir es de QUIÉN puede cerrar clases: el profesor solo las suyas; los
  // coordinadores, las de cualquiera. Antes esto era una lista de roles escrita a
  // mano que además incluía al coord. administrativo, que ya ni siquiera tiene el
  // módulo — se leía como si él pudiera, y no.
  const esDueno = clase.profesor_id === profile.id;
  if (profile.role === "profesor" && !esDueno) {
    return { error: "Solo puedes cerrar las clases que dictaste tú." };
  }

  // Piso: una clase no se puede cerrar ANTES de que empiece. Sin esto se podía
  // marcar asistencia por la mañana de una clase de la tarde, o de toda la
  // programación futura de una academia — asistencia inventada, y encima cuenta
  // para la liquidación. Se toma la hora de inicio: una vez arrancó, registrarla
  // es legítimo. Las clases sin hora quedan disponibles todo su día.
  const inicio = instanteClase(clase.fecha, clase.hora_inicio);
  if (Date.now() < inicio) {
    return { error: "Esta clase todavía no ha empezado. Se puede cerrar cuando haya iniciado." };
  }

  // Techo: pasado el plazo de 24h, solo el superadministrador puede registrar.
  const venció = Date.now() > instanteClase(clase.fecha, clase.hora_inicio, "23:59:00") + 24 * 3600 * 1000;
  if (venció && profile.role !== "superadmin") {
    return {
      error: "Pasaron más de 24 h. Solo el superadministrador puede registrarla (solicítaselo).",
    };
  }

  const noRegistrados = String(formData.get("asistentes_no_registrados") || "").trim() || null;
  // Nº de personas de la clase particular (define el escalón de precio en la liquidación).
  const numRaw = formData.get("num_asistentes");
  const numAsistentes =
    clase.tipo !== "academia" && numRaw != null && String(numRaw).trim() !== ""
      ? Math.max(1, Math.floor(Number(numRaw)))
      : null;
  const { error: upErr } = await supabase
    .from("clases")
    .update({
      estado,
      registrada_por: profile.id,
      asistentes_no_registrados: noRegistrados,
      ...(numAsistentes != null ? { num_asistentes: numAsistentes } : {}),
    })
    .eq("id", claseId);
  if (upErr) return { error: upErr.message };

  // Asistencia por MIEMBRO (hermano). Los valores "deportista" son miembro_id.
  const deportistas = formData.getAll("deportista").map(Number).filter(Boolean);
  /** Marcado como "no vino" en la lista de reposiciones: no se registra asistencia. */
  const noVino = (mid: number) => String(formData.get(`asis_${mid}`) || "") === "no";
  const estadoAsis = (mid: number) => {
    const e = String(formData.get(`asis_${mid}`) || "presente");
    return (["presente", "ausente", "excusa_medica", "reposicion"].includes(e) ? e : "presente") as
      | "presente"
      | "ausente"
      | "excusa_medica"
      | "reposicion";
  };
  const { data: mrows } = deportistas.length
    ? await supabase.from("cliente_miembros").select("id, cliente_id, nombres").in("id", deportistas)
    : { data: [] as { id: number; cliente_id: number; nombres: string }[] };
  const cliDeMiembro = new Map((mrows ?? []).map((m) => [m.id, m.cliente_id]));
  for (const mid of deportistas) {
    // "no" = aparecía en la lista de reposiciones y no vino: no se registra nada,
    // y si había un registro previo se borra (alguien lo marcó y se corrigió).
    if (noVino(mid)) {
      await supabase.from("asistencias").delete().eq("clase_id", claseId).eq("miembro_id", mid);
      continue;
    }
    const est = estadoAsis(mid);
    const cliId = cliDeMiembro.get(mid) ?? clase.cliente_id;
    if (cliId == null) continue; // sin ficha no se puede registrar asistencia
    await supabase.from("asistencias").upsert(
      {
        clase_id: claseId,
        miembro_id: mid,
        cliente_id: cliId,
        presente: est === "presente",
        estado: est,
        registrado_por: profile.id,
      },
      { onConflict: "clase_id,miembro_id" },
    );
  }

  // Consumo de paquete (si la clase está ligada a uno y se dictó).
  let paqueteInfo: { restante: number; total: number } | null = null;
  if (estado === "realizada" && clase.paquete_cliente_id) {
    const { data: pq } = await supabase
      .from("paquetes_cliente")
      .select("num_clases, clases_consumidas, estado")
      .eq("id", clase.paquete_cliente_id)
      .single();
    if (pq) {
      const consumidas = pq.clases_consumidas + 1;
      await supabase
        .from("paquetes_cliente")
        .update({
          clases_consumidas: consumidas,
          // Un paquete anulado no revive por cerrarle una clase vieja.
          estado: pq.estado === "anulado" ? "anulado" : consumidas >= pq.num_clases ? "agotado" : "activo",
        })
        .eq("id", clase.paquete_cliente_id);
      paqueteInfo = { restante: pq.num_clases - consumidas, total: pq.num_clases };
    }
  }

  // Notificación a la familia: clase confirmada + saldo del paquete (no bloquea el cierre).
  if (estado === "realizada") {
    const presentes = deportistas.filter((mid) => !noVino(mid) && estadoAsis(mid) === "presente");
    if (presentes.length) {
      const cliIds = [...new Set(presentes.map((mid) => cliDeMiembro.get(mid)).filter((x): x is number => x != null))];
      // ⚠️ El correo de la familia solo está en `clientes`, y el PROFESOR no
      // puede leer esa tabla (política `clientes_select`, que lo excluye a
      // propósito). Con la sesión del profesor esta consulta devolvía cero
      // filas sin error, así que cada vez que cerraba él —y es quien más
      // cierra— la familia se quedaba sin su correo de confirmación, en
      // silencio. Se lee con service_role SOLO para esto: quién puede cerrar
      // esta clase ya quedó validado arriba, y de aquí no sale nada a la
      // pantalla, solo el envío.
      const lector = createAdminClient();
      const { data: cls } = cliIds.length
        ? await lector.from("clientes").select("id, nombres, email").in("id", cliIds)
        : { data: [] as { id: number; nombres: string; email: string | null }[] };
      const cli = new Map((cls ?? []).map((c) => [c.id, c]));
      const nombreDe = new Map((mrows ?? []).map((m) => [m.id, m.nombres]));
      const profesorNombre = await nombreStaff(clase.profesor_id);
      for (const mid of presentes) {
        const c = cli.get(cliDeMiembro.get(mid) ?? -1);
        if (!c?.email) continue;
        const conSaldo = !!paqueteInfo && clase.cliente_id === c.id;
        const { subject, html } = claseConfirmadaEmail({
          nombre: nombreDe.get(mid) ?? c.nombres,
          deporte: clase.deporte,
          fecha: clase.fecha,
          hora: clase.hora_inicio?.slice(0, 5) ?? "",
          profesor: profesorNombre,
          saldo: conSaldo ? paqueteInfo!.restante : null,
          total: conSaldo ? paqueteInfo!.total : null,
        });
        const r = await sendEmail({ to: c.email, subject, html });
        if (!r.ok) console.error("correo cierre:", r.error);
      }
    }
  }

  await logAudit({
    action: "clase.cierre",
    entity: "clases",
    entityId: String(claseId),
    after: { estado },
  });
  revalidatePath("/cierre");
  revalidatePath(`/cierre/${claseId}`);
  revalidatePath("/liquidacion");
  // Tras registrar (realizada/cancelada/no-show) volvemos al listado con aviso de éxito.
  redirect(`/cierre?ok=${estado}`);
}

/**
 * Deshace el cierre de una clase (solo superadministrador): vuelve a "programada" para
 * poder cerrarla de nuevo. Si estaba realizada y ligada a un paquete, RESTAURA el consumo.
 */
export async function reabrirCierre(claseId: number): Promise<CierreState> {
  await requireRole(["superadmin"]);
  if (!claseId) return { error: "Clase inválida." };

  const supabase = await createClient();
  const { data: clase } = await supabase
    .from("clases")
    .select("id, estado, paquete_cliente_id")
    .eq("id", claseId)
    .single();
  if (!clase) return { error: "Clase no encontrada." };
  if (clase.estado === "programada") return { error: "La clase ya está abierta (pendiente de cierre)." };

  // Restaurar consumo del paquete solo si la clase estaba realizada (lo que consumió saldo).
  if (clase.estado === "realizada" && clase.paquete_cliente_id) {
    const { data: pq } = await supabase
      .from("paquetes_cliente")
      .select("num_clases, clases_consumidas, estado")
      .eq("id", clase.paquete_cliente_id)
      .single();
    if (pq) {
      const consumidas = Math.max(0, pq.clases_consumidas - 1);
      await supabase
        .from("paquetes_cliente")
        .update({
          clases_consumidas: consumidas,
          // Un paquete anulado no revive por reabrirle una clase.
          estado: pq.estado === "anulado" ? "anulado" : consumidas >= pq.num_clases ? "agotado" : "activo",
        })
        .eq("id", clase.paquete_cliente_id);
    }
  }

  // Vuelve a pendiente y limpia la asistencia registrada.
  await supabase.from("asistencias").delete().eq("clase_id", claseId);
  const { error } = await supabase
    .from("clases")
    .update({ estado: "programada", registrada_por: null })
    .eq("id", claseId);
  if (error) return { error: error.message };

  await logAudit({ action: "clase.reabrir", entity: "clases", entityId: String(claseId), after: { desde: clase.estado, a: "programada" } });
  revalidatePath("/cierre");
  revalidatePath("/cierre/cerradas");
  revalidatePath("/liquidacion");
  revalidatePath("/clases");
  return { ok: "Cierre deshecho. La clase volvió a pendientes." };
}
