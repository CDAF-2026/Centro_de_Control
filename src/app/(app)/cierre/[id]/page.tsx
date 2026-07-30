import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { nombreStaff } from "@/lib/staff";
import { valorPaquete } from "@/lib/finanzas";
import { CierreForm } from "./cierre-form";

/** "16:30:00" → 990 minutos. null si no parsea. */
function aMinutos(t: string | null): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec((t ?? "").trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export default async function CerrarClasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole(rolesForModule("cierre_clase"));
  const { id } = await params;
  const claseId = Number(id);
  const supabase = await createClient();

  const { data: clase } = await supabase
    .from("clases")
    .select("id, tipo, fecha, hora_inicio, deporte, estado, academia_id, cliente_id, miembro_id, profesor_id, asistentes_no_registrados, num_asistentes, precio, valor_facturado, paquete_cliente_id")
    .eq("id", claseId)
    .single();
  if (!clase) notFound();

  // Valor que se factura al cliente por esta clase (solo lectura, para que el profe lo vea al cerrar).
  // Se calcula igual que la liquidación. Academia = por alumno asistente → no hay un valor fijo aquí.
  let valorFacturado: number | null = null;
  if (clase.tipo !== "academia") {
    if (clase.paquete_cliente_id) {
      const { data: pc } = await supabase
        .from("paquetes_cliente")
        .select("catalogo_id, num_clases, descuento_pct")
        .eq("id", clase.paquete_cliente_id)
        .single();
      if (pc) {
        const { data: cat } = pc.catalogo_id
          ? await supabase.from("paquetes_catalogo").select("precio, descuento_pct").eq("id", pc.catalogo_id).single()
          : { data: null };
        const base = cat ? valorPaquete(cat.precio, Number(cat.descuento_pct), Number(pc.descuento_pct)) : 0;
        valorFacturado = clase.valor_facturado ?? (pc.num_clases > 0 ? Math.round(base / pc.num_clases) : 0);
      }
    } else {
      valorFacturado = clase.valor_facturado ?? clase.precio ?? 0;
    }
  }

  // El roster se arma por MIEMBRO (hermano): así dos hermanos de la misma
  // academia aparecen por separado y cada uno cuenta para cobro y liquidación.
  let deportistas: { id: number; nombre: string }[] = [];
  let otrosInscritos: { id: number; nombre: string }[] = [];
  if (clase.tipo === "academia" && clase.academia_id) {
    // Se espera SOLO a quien tenga ese día a esa hora en su horario. Antes se
    // filtraba por `inscripciones.dias`, que quedó en desuso con el modelo de
    // horarios por inscrito: hoy está siempre vacío, así que la condición
    // `dias.length === 0` dejaba pasar a TODOS los inscritos de la academia.
    const diaClase = new Date(`${clase.fecha}T00:00:00`).getDay();
    const horaClase = aMinutos(clase.hora_inicio);

    const { data: ins } = await supabase
      .from("inscripciones")
      .select("id, miembro_id")
      .eq("academia_id", clase.academia_id)
      .eq("activa", true);
    const insList = (ins ?? []).filter(
      (i): i is { id: number; miembro_id: number } => i.miembro_id != null,
    );

    const { data: hors } = insList.length
      ? await supabase
          .from("inscripcion_horarios")
          .select("inscripcion_id, dia_semana, hora_inicio")
          .in("inscripcion_id", insList.map((i) => i.id))
      : { data: [] };

    // ±20 min de tolerancia, igual que el tablero de rendimiento: una clase
    // registrada 16:05 sigue siendo la franja de las 16:00.
    const esperadas = new Set(
      (hors ?? [])
        .filter((h) => {
          if (h.dia_semana !== diaClase) return false;
          if (horaClase == null) return true; // clase sin hora: basta el día
          const hh = aMinutos(h.hora_inicio);
          return hh != null && Math.abs(hh - horaClase) <= 20;
        })
        .map((h) => h.inscripcion_id),
    );

    const idsEsperados = insList.filter((i) => esperadas.has(i.id)).map((i) => i.miembro_id);
    const idsOtros = insList.filter((i) => !esperadas.has(i.id)).map((i) => i.miembro_id);
    const todos = [...idsEsperados, ...idsOtros];
    if (todos.length) {
      const { data: ms } = await supabase
        .from("cliente_miembros")
        .select("id, nombres, apellidos")
        .in("id", todos)
        .eq("activo", true);
      const nombrePorId = new Map((ms ?? []).map((m) => [m.id, `${m.apellidos}, ${m.nombres}`]));
      const arma = (ids: number[]) =>
        ids
          .filter((id) => nombrePorId.has(id))
          .map((id) => ({ id, nombre: nombrePorId.get(id)! }))
          .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
      deportistas = arma(idsEsperados);
      otrosInscritos = arma(idsOtros);
    }
  } else if (clase.miembro_id) {
    const { data: m } = await supabase.from("cliente_miembros").select("id, nombres, apellidos").eq("id", clase.miembro_id).single();
    if (m) deportistas = [{ id: m.id, nombre: `${m.apellidos}, ${m.nombres}` }];
  } else if (clase.cliente_id) {
    // Clase individual sin miembro fijado: cae al titular de la ficha.
    const { data: m } = await supabase
      .from("cliente_miembros")
      .select("id, nombres, apellidos")
      .eq("cliente_id", clase.cliente_id)
      .eq("es_titular", true)
      .maybeSingle();
    if (m) deportistas = [{ id: m.id, nombre: `${m.apellidos}, ${m.nombres}` }];
  }

  const { data: asis } = await supabase
    .from("asistencias")
    .select("miembro_id, presente, estado")
    .eq("clase_id", claseId);
  const estadoPorCliente: Record<number, string> = {};
  for (const a of asis ?? []) if (a.miembro_id != null) estadoPorCliente[a.miembro_id] = a.estado ?? (a.presente ? "presente" : "ausente");

  const profesorNombre = await nombreStaff(clase.profesor_id);
  let academiaNombre: string | null = null;
  if (clase.tipo === "academia" && clase.academia_id) {
    const { data: a } = await supabase.from("academias").select("nombre").eq("id", clase.academia_id).single();
    academiaNombre = a?.nombre ?? null;
  }
  const titulo =
    clase.tipo === "academia"
      ? `Academia: ${academiaNombre ?? "—"}`
      : deportistas[0]?.nombre ?? "Sin deportista";

  return (
    <div className="max-w-md space-y-6">
      <div>
        <Link href="/cierre" className="text-muted-foreground text-sm hover:underline">
          ← Pendientes
        </Link>
        <p className="cdaf-eyebrow text-muted-foreground mt-1">Cerrar clase</p>
        <h1 className="cdaf-headline">{titulo}</h1>
        <p className="text-muted-foreground text-sm">
          {clase.fecha} {clase.hora_inicio?.slice(0, 5) ?? ""} ·{" "}
          {clase.tipo === "academia" ? "Academia" : "Individual"}
          {clase.deporte ? ` · ${clase.deporte}` : ""} · Profe: {profesorNombre ?? "—"}
        </p>
      </div>
      <CierreForm
        claseId={claseId}
        estadoActual={clase.estado}
        deportistas={deportistas}
        otrosInscritos={otrosInscritos}
        estadoPorCliente={estadoPorCliente}
        esAcademia={clase.tipo === "academia"}
        noRegistrados={clase.asistentes_no_registrados ?? ""}
        numAsistentes={clase.num_asistentes ?? 1}
        valorFacturado={valorFacturado}
      />
    </div>
  );
}
