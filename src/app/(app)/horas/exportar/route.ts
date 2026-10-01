import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { rangoNomina } from "@/lib/periodo";
import { mesActual, mesLargo } from "@/lib/fecha";
import { excelHoras } from "@/lib/turnos-excel";
import type { TurnoHoras, TurnoListado } from "@/lib/database.types";

export const dynamic = "force-dynamic";

/**
 * Descarga en Excel del reporte de horas, con el MISMO periodo que esté en
 * pantalla (`?periodo=mes|q1|q2&ym=AAAA-MM`): lo que se ve es lo que se baja.
 *
 * Lo pueden bajar los mismos que ven el reporte (superadministrador y coord.
 * administrativo, Laura 1-oct-2026): el archivo no trae nada que la pantalla no
 * muestre ya. Las consultas corren con la sesión de quien descarga, así que la
 * RLS de turnos decide igual que en `/horas`.
 */
export async function GET(request: Request) {
  await requireRole(rolesForModule("turnos_reporte"));

  const sp = new URL(request.url).searchParams;
  const p = sp.get("periodo");
  const periodo = p === "q1" || p === "q2" ? p : "mes";
  const ymRaw = sp.get("ym") ?? "";
  const ym = /^\d{4}-\d{2}$/.test(ymRaw) ? ymRaw : mesActual();
  const { desde, hasta } = rangoNomina(periodo, ym);

  const supabase = await createClient();
  const [horasRes, turnosRes, gente] = await Promise.all([
    supabase.rpc("turnos_horas", { p_desde: desde, p_hasta: hasta }),
    supabase.rpc("turnos_listar", { p_desde: desde, p_hasta: hasta }),
    // Lectura directa de `profiles`: legítima aquí por lo mismo que en /horas
    // (solo SA/CA, y hace falta `marca_turno`).
    supabase.from("profiles").select("id, nombre, role").eq("marca_turno", true),
  ]);
  // ⚠️ Un error NO puede bajar un Excel con ceros: se vería igual que un periodo
  // sin turnos y alguien pagaría con él.
  const fallo = horasRes.error ?? turnosRes.error ?? gente.error;
  if (fallo) return new Response(`No se pudo armar el Excel: ${fallo.message}`, { status: 500 });

  const turnos: TurnoListado[] = turnosRes.data ?? [];
  const pausas = new Map<number, { inicio: string; fin: string | null }>();
  if (turnos.length) {
    const { data, error } = await supabase
      .from("turno_pausa")
      .select("turno_id, inicio_el, fin_el")
      .in("turno_id", turnos.map((t) => t.id))
      .order("inicio_el");
    if (error) return new Response(`No se pudo armar el Excel: ${error.message}`, { status: 500 });
    for (const pa of data ?? []) {
      if (!pausas.has(pa.turno_id)) pausas.set(pa.turno_id, { inicio: pa.inicio_el, fin: pa.fin_el });
    }
  }

  const rotuloPeriodo =
    periodo === "q1" ? "quincena 1 (1–15)" : periodo === "q2" ? "quincena 2 (16–fin)" : "mes completo";
  const archivo = await excelHoras({
    rotulo: `${mesLargo(ym)} · ${rotuloPeriodo}`,
    personas: gente.data ?? [],
    horas: (horasRes.data ?? []) as TurnoHoras[],
    turnos,
    pausas,
  });

  const nombre = `horas-personal-${ym}${periodo === "mes" ? "" : `-${periodo}`}.xlsx`;
  return new Response(new Uint8Array(archivo), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Cache-Control": "no-store",
    },
  });
}
