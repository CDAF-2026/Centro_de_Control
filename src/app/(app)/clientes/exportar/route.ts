import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Mismas columnas que la plantilla de importación (round-trip) + deportes y estado.
const HEADER =
  "nombres,apellidos,documento,fecha_nacimiento,celular,email,emergencia_nombre,emergencia_celular,emergencia_parentesco,acudiente_nombre,acudiente_documento,acudiente_telefono,acudiente_parentesco,deportes,estado";

const SELECT =
  "nombres, apellidos, documento, fecha_nacimiento, celular, email, emergencia_nombre, emergencia_celular, emergencia_parentesco, deportes, estado, acudientes ( nombre, documento, telefono, parentesco )";

/** Escapa un valor para CSV (comillas, comas y saltos de línea). */
function esc(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(request: Request) {
  await requireRole(rolesForModule("clientes"));

  const { searchParams } = new URL(request.url);
  const safe = (searchParams.get("q") ?? "").replace(/[%,()*]/g, "").trim();
  const estado = searchParams.get("estado") ?? "";

  const supabase = await createClient();

  // Paginado en lotes: PostgREST corta a 1000 filas por request.
  const BATCH = 1000;
  const filas: string[] = [];
  for (let desde = 0; ; desde += BATCH) {
    let query = supabase
      .from("clientes")
      .select(SELECT)
      .order("apellidos")
      .order("nombres")
      .range(desde, desde + BATCH - 1);
    if (safe) query = query.or(`nombres.ilike.%${safe}%,apellidos.ilike.%${safe}%,documento.ilike.%${safe}%`);
    if (estado === "activo" || estado === "retirado") query = query.eq("estado", estado);

    const { data, error } = await query;
    if (error) return new Response(`Error al exportar: ${error.message}`, { status: 500 });

    for (const c of data ?? []) {
      const acu = (c.acudientes ?? null) as { nombre?: string; documento?: string; telefono?: string; parentesco?: string } | null;
      filas.push(
        [
          c.nombres,
          c.apellidos,
          c.documento,
          c.fecha_nacimiento,
          c.celular,
          c.email,
          c.emergencia_nombre,
          c.emergencia_celular,
          c.emergencia_parentesco,
          acu?.nombre,
          acu?.documento,
          acu?.telefono,
          acu?.parentesco,
          (c.deportes ?? []).join("; "),
          c.estado,
        ]
          .map(esc)
          .join(","),
      );
    }
    if (!data || data.length < BATCH) break;
  }

  // BOM para que Excel abra bien los acentos.
  const csv = `﻿${HEADER}\n${filas.join("\n")}\n`;
  const fecha = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="clientes-${fecha}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
