import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { diaIso, fechaLarga } from "@/lib/fecha";
import { mapaNombresStaff } from "@/lib/staff";
import { excelInscritos } from "./excel";

export const dynamic = "force-dynamic";

/**
 * Descarga en Excel de los alumnos de cada profesor, con los datos de este momento.
 *
 * Lo bajan los que EDITAN academias (superadministrador y los dos coordinadores,
 * Laura 3-nov-2026): recepción consulta el módulo, pero un archivo con nombres y
 * edades de menores no sale de ahí. Las consultas corren con la sesión de quien
 * descarga, así que la RLS decide igual que en la matrícula.
 */
export async function GET() {
  await requireRole(rolesForModule("academias", "edit"));

  const supabase = await createClient();
  const { data: academias, error } = await supabase.from("academias").select("id, nombre, deporte");
  // ⚠️ Un error NO puede bajar un Excel vacío: se vería igual que un club sin
  // alumnos. Una lectura rechazada por RLS tampoco da error, solo 0 filas, y
  // las 4 academias siempre existen: si no llega ninguna, algo falló.
  if (error) return new Response(`No se pudo armar el Excel: ${error.message}`, { status: 500 });
  if (!academias?.length) return new Response("No se pudo armar el Excel: no se leyó ninguna academia.", { status: 500 });

  const [respuestas, nombres] = await Promise.all([
    Promise.all(academias.map((a) => supabase.rpc("academia_matricula", { p_academia: a.id }))),
    mapaNombresStaff(),
  ]);
  const fallo = respuestas.find((r) => r.error)?.error;
  if (fallo) return new Response(`No se pudo armar el Excel: ${fallo.message}`, { status: 500 });
  // `mapaNombresStaff` no avisa si falla: sin esto saldrían todos "sin nombre".
  if (nombres.size === 0) return new Response("No se pudo armar el Excel: no se leyeron los profesores.", { status: 500 });

  const matriculas = academias.flatMap((a, i) =>
    (respuestas[i].data ?? []).map((m) => ({
      miembro_id: m.miembro_id,
      nombre: m.nombre,
      edad: m.edad,
      academia: a.nombre,
      deporte: a.deporte,
      clases: m.clases,
    })),
  );

  const ahora = new Date().toISOString();
  const hoy = diaIso(ahora);
  const archivo = await excelInscritos({
    rotulo: `Corte del ${fechaLarga(ahora)} de ${hoy.slice(0, 4)}`,
    matriculas,
    nombres,
  });

  return new Response(new Uint8Array(archivo), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="inscritos-por-profesor-${hoy}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
