import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { valorPaquete } from "@/lib/finanzas";
import { CierreForm } from "./cierre-form";

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
  if (clase.tipo === "academia" && clase.academia_id) {
    const diaClase = new Date(`${clase.fecha}T00:00:00`).getDay();
    const { data: ins } = await supabase
      .from("inscripciones")
      .select("miembro_id, dias")
      .eq("academia_id", clase.academia_id)
      .eq("activa", true);
    const ids = (ins ?? [])
      .filter((i) => i.dias.length === 0 || i.dias.includes(diaClase))
      .map((i) => i.miembro_id)
      .filter((x): x is number => x != null);
    if (ids.length) {
      const { data: ms } = await supabase.from("cliente_miembros").select("id, nombres, apellidos").in("id", ids).eq("activo", true);
      deportistas = (ms ?? []).map((m) => ({ id: m.id, nombre: `${m.apellidos}, ${m.nombres}` }));
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

  let profesorNombre: string | null = null;
  if (clase.profesor_id) {
    const { data: p } = await supabase.from("profiles").select("nombre").eq("id", clase.profesor_id).single();
    profesorNombre = p?.nombre ?? null;
  }
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
        estadoPorCliente={estadoPorCliente}
        esAcademia={clase.tipo === "academia"}
        noRegistrados={clase.asistentes_no_registrados ?? ""}
        numAsistentes={clase.num_asistentes ?? 1}
        valorFacturado={valorFacturado}
      />
    </div>
  );
}
