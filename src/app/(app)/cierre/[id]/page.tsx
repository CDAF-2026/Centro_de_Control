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
    .select("id, tipo, fecha, hora_inicio, deporte, estado, academia_id, cliente_id, profesor_id")
    .eq("id", claseId)
    .single();
  if (!clase) notFound();

  let deportistas: { id: number; nombre: string }[] = [];
  if (clase.tipo === "academia" && clase.academia_id) {
    const { data: ins } = await supabase
      .from("inscripciones")
      .select("cliente_id")
      .eq("academia_id", clase.academia_id)
      .eq("activa", true);
    const ids = (ins ?? []).map((i) => i.cliente_id);
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
    .select("cliente_id, presente")
    .eq("clase_id", claseId);
  const presentes = (asis ?? []).filter((a) => a.presente).map((a) => a.cliente_id);

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
        presentes={presentes}
      />
    </div>
  );
}
