import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
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
    .select("id, tipo, fecha, hora_inicio, deporte, estado, academia_id, cliente_id, profesor_id, asistentes_no_registrados")
    .eq("id", claseId)
    .single();
  if (!clase) notFound();

  let deportistas: { id: number; nombre: string }[] = [];
  if (clase.tipo === "academia" && clase.academia_id) {
    const diaClase = new Date(`${clase.fecha}T00:00:00`).getDay();
    const { data: ins } = await supabase
      .from("inscripciones")
      .select("cliente_id, dias")
      .eq("academia_id", clase.academia_id)
      .eq("activa", true);
    // Solo los alumnos cuyos días incluyen el día de esta clase (o sin días definidos).
    const ids = (ins ?? [])
      .filter((i) => i.dias.length === 0 || i.dias.includes(diaClase))
      .map((i) => i.cliente_id);
    if (ids.length) {
      const { data: cl } = await supabase.from("clientes").select("id, nombres, apellidos").in("id", ids);
      deportistas = (cl ?? []).map((c) => ({ id: c.id, nombre: `${c.apellidos}, ${c.nombres}` }));
    }
  } else if (clase.cliente_id) {
    const { data: c } = await supabase
      .from("clientes")
      .select("id, nombres, apellidos")
      .eq("id", clase.cliente_id)
      .single();
    if (c) deportistas = [{ id: c.id, nombre: `${c.apellidos}, ${c.nombres}` }];
  }

  const { data: asis } = await supabase
    .from("asistencias")
    .select("cliente_id, presente, estado")
    .eq("clase_id", claseId);
  const estadoPorCliente: Record<number, string> = {};
  for (const a of asis ?? []) estadoPorCliente[a.cliente_id] = a.estado ?? (a.presente ? "presente" : "ausente");

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
      />
    </div>
  );
}
