import Link from "next/link";
import { notFound } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { rolesForModule, can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { mapaNombresStaff } from "@/lib/staff";
import { rangoPeriodo, parsePeriodo } from "@/lib/periodo";
import { PeriodoToggle } from "../../../../dashboard/periodo-toggle";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { DIA_CORTO, NIVEL_LABEL } from "../../../ocupacion";
import { FranjasDesplegables, type FranjaFila, type NinoEnFranja } from "./franjas-desplegables";

export default async function GrupoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; grupoId: string }>;
  searchParams: Promise<{ periodo?: string; desde?: string; hasta?: string }>;
}) {
  const profile = await requireRole(rolesForModule("academias"));
  const { id, grupoId } = await params;
  const academiaId = Number(id);
  const gid = Number(grupoId);
  const sp = await searchParams;
  const periodo = parsePeriodo(sp.periodo);
  const { curStartIso, curEndIso } = rangoPeriodo(periodo, new Date(), sp.desde, sp.hasta);

  const supabase = await createClient();
  const { data: g } = await supabase
    .from("academia_grupo")
    .select("id, academia_id, nombre, nivel, edad_min, edad_max")
    .eq("id", gid)
    .maybeSingle();
  if (!g || g.academia_id !== academiaId) notFound();

  const [{ data: aca }, { data: franjas }, { data: inscritos }, nombres] = await Promise.all([
    supabase.from("academias").select("nombre").eq("id", academiaId).single(),
    supabase.rpc("grupo_franjas", { p_grupo: gid }),
    // El periodo sigue haciendo falta: alimenta la asistencia DE CADA NIÑO, que
    // es la que decide algo aquí (¿le cambio el día?, ¿lo retiro?).
    supabase.rpc("grupo_inscritos_por_franja", { p_grupo: gid, p_desde: curStartIso, p_hasta: curEndIso }),
    mapaNombresStaff(),
  ]);

  const fr = franjas ?? [];
  const filas: NinoEnFranja[] = (inscritos ?? []).map((n) => ({
    franjaId: n.franja_id,
    inscripcionId: n.inscripcion_id,
    miembroId: n.miembro_id,
    clienteId: n.cliente_id,
    nombre: n.nombre,
    edad: n.edad,
    fueraDeRango: n.fuera_de_rango,
    esperadas: n.esperadas,
    presentes: n.presentes,
    excusas: n.excusas,
  }));
  // Un niño con dos franjas viene dos veces en las filas: la cuenta es de PERSONAS.
  const totalNinos = new Set(filas.map((n) => n.miembroId)).size;
  const franjasUI: FranjaFila[] = fr.map((f) => ({
    id: f.franja_id,
    dia: f.dia_semana,
    horaInicio: f.hora_inicio,
    horaFin: f.hora_fin,
    profesor: f.profesor_id ? nombres.get(f.profesor_id) ?? null : null,
    cancha: f.cancha,
    cupo: f.cupo,
    inscritos: f.inscritos,
  }));

  const tope = fr[0]?.cupo ?? 0;
  const sobre = fr.filter((f) => f.inscritos > f.cupo);
  const puedeInscribir = ["superadmin", "coord_admin", "coord_deportivo", "recepcion"].includes(profile.role);
  const puedeGestionar = can(profile.role, "academias", "edit");

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/academias/${academiaId}`} className="text-muted-foreground text-sm hover:underline">
          ← {aca?.nombre ?? "Academia"}
        </Link>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="cdaf-headline">{g.nombre}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{NIVEL_LABEL[g.nivel] ?? g.nivel}</Badge>
              <Badge variant="secondary">{g.edad_min} a {g.edad_max} años</Badge>
              {tope > 0 && (
                <span className="text-muted-foreground text-xs">Máximo {tope} niños por franja</span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <PeriodoToggle
              periodo={periodo}
              desde={sp.desde}
              hasta={sp.hasta}
              basePath={`/academias/${academiaId}/grupos/${gid}`}
            />
            {puedeGestionar && (
              <Link href={`/academias/${academiaId}/grupos/${gid}/editar`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                Editar grupo
              </Link>
            )}
            {puedeInscribir && (
              <Link href={`/academias/${academiaId}/inscribir?grupo=${gid}`} className={buttonVariants({ size: "sm" })}>
                + Inscribir niño
              </Link>
            )}
          </div>
        </div>
      </div>

      {sobre.length > 0 && (
        <p className="border-warning/35 bg-warning/10 flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm text-[#6d4700]">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>
            <strong>
              {sobre.length === 1 ? "Una franja está" : `${sobre.length} franjas están`} por encima del cupo.
            </strong>{" "}
            {sobre.map((f) => `${DIA_CORTO[f.dia_semana]} va con ${f.inscritos}`).join(", ")}, y el tope de{" "}
            {(NIVEL_LABEL[g.nivel] ?? g.nivel).toLowerCase()} es {tope}. Se puede inscribir igual — esto es
            un aviso, no un bloqueo.
          </span>
        </p>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="cdaf-title text-base">Franjas · {totalNinos} {totalNinos === 1 ? "inscrito" : "inscritos"}</h2>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Cada franja es una clase. Ábrela para ver quiénes vienen ese día.
            </p>
          </div>
          {puedeGestionar && (
            <Link href={`/academias/${academiaId}/grupos/${gid}/franjas`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Editar franjas
            </Link>
          )}
        </div>

        {franjasUI.length === 0 ? (
          <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm">
            Este grupo no tiene franjas. Agrégale al menos una para poder inscribir niños.
          </p>
        ) : (
          <FranjasDesplegables
            franjas={franjasUI}
            ninos={filas}
            edadMin={g.edad_min}
            edadMax={g.edad_max}
            academiaId={academiaId}
            puedeGestionar={puedeGestionar}
          />
        )}
      </section>

    </div>
  );
}
