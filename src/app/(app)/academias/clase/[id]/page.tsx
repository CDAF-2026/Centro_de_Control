import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { rolesForModule, can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { mapaNombresStaff } from "@/lib/staff";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { DIA_LARGO, hhmm, horaFin, duracionTexto, coloresDeProfesores } from "../../ui";
import { docentesConDeporte, opcionesParaDeporte } from "@/lib/staff";
import { RosterClase, type NinoEnClase, type ClaseOpcion, type AcademiaOpcion } from "./roster";

/**
 * La ficha de una clase del planeador. Aquí pasa la operación del día a día:
 * agregar un niño, quitarlo de ese día, moverlo de horario o retirarlo de la
 * academia. Está todo junto a propósito — en el club son la misma conversación.
 */
export default async function ClasePage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireRole(rolesForModule("academias"));
  const { id } = await params;
  const claseId = Number(id);
  const supabase = await createClient();

  const { data: clase } = await supabase
    .from("clase_semanal")
    .select("id, profesor_id, deporte, dia_semana, hora_inicio, duracion_min, cancha, colegio, activa")
    .eq("id", claseId)
    .maybeSingle();
  if (!clase) notFound();

  const [{ data: roster }, { data: todas }, { data: academias }, nombres, docentes] = await Promise.all([
    supabase.rpc("clase_semanal_roster", { p_clase: claseId }),
    supabase.rpc("planeador_semana", { p_deporte: clase.deporte }),
    supabase.from("academias").select("id, nombre, categoria, deporte").eq("deporte", clase.deporte).eq("activa", true).order("categoria"),
    mapaNombresStaff(),
    docentesConDeporte(),
  ]);

  const ninos: NinoEnClase[] = (roster ?? []).map((n) => ({
    inscripcionId: n.inscripcion_id,
    miembroId: n.miembro_id,
    clienteId: n.cliente_id,
    nombre: n.nombre,
    edad: n.edad,
    academiaId: n.academia_id,
    categoria: n.categoria,
    otrasClases: n.otras_clases,
  }));

  // A dónde se puede mover un niño: cualquier otra clase del planeador. No se
  // limita al mismo profesor — el club mueve niños entre profesores (9 de los
  // 110 van con dos distintos).
  const destinos: ClaseOpcion[] = (todas ?? [])
    // Una clase de colegio no lleva niños: no es destino.
    .filter((c) => c.clase_id !== claseId && !c.colegio)
    .map((c) => ({
      id: c.clase_id,
      etiqueta: `${DIA_LARGO[c.dia_semana]} ${hhmm(c.hora_inicio)} · ${nombres.get(c.profesor_id) ?? "—"} · ${c.ninos} ${c.ninos === 1 ? "niño" : "niños"}`,
    }));

  const opcionesAcademia: AcademiaOpcion[] = (academias ?? []).map((a) => ({
    id: a.id,
    nombre: a.nombre,
    categoria: a.categoria ?? "recreativa",
  }));

  const puedeEditar = can(profile.role, "academias", "edit");
  const profesor = nombres.get(clase.profesor_id) ?? "—";
  const lista = opcionesParaDeporte(docentes, clase.deporte).map((p) => ({ id: p.id, nombre: p.nombre }));
  if (!lista.some((p) => p.id === clase.profesor_id)) lista.push({ id: clase.profesor_id, nombre: profesor });
  const col = coloresDeProfesores(lista).get(clase.profesor_id)!;

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/academias/profesor/${clase.profesor_id}`} className="text-muted-foreground text-sm hover:underline">
          ← {profesor}
        </Link>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="cdaf-headline">
              {DIA_LARGO[clase.dia_semana]} {hhmm(clase.hora_inicio)}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="gap-1.5">
                <span className="size-2 rounded-[2px]" style={{ background: col.c }} />
                {profesor}
              </Badge>
              <Badge variant="outline">
                {hhmm(clase.hora_inicio)}–{horaFin(clase.hora_inicio, clase.duracion_min)} · {duracionTexto(clase.duracion_min)}
              </Badge>
              {clase.cancha && <Badge variant="outline">Cancha {clase.cancha}</Badge>}
              {clase.deporte === "padel" && <Badge variant="outline">Pádel</Badge>}
              {clase.colegio && <Badge>Colegio {clase.colegio}</Badge>}
            </div>
          </div>
          {puedeEditar && (
            <Link href={`/academias/clase/${claseId}/editar`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Editar clase
            </Link>
          )}
        </div>
      </div>

      {clase.colegio ? (
        // Clase de colegio: no lleva lista. El profesor solo dice si se dictó.
        <p className="ring-foreground/[0.06] bg-card text-muted-foreground rounded-xl p-5 text-sm shadow-sm ring-1">
          Es la clase del colegio <strong className="text-foreground">{clase.colegio}</strong>: no
          lleva niños inscritos. Sale en Cierre de clases como las demás y al cerrarla solo se dice
          si se dictó o no.
        </p>
      ) : (
        <RosterClase
          claseId={claseId}
          ninos={ninos}
          destinos={destinos}
          academias={opcionesAcademia}
          puedeEditar={puedeEditar}
        />
      )}
    </div>
  );
}
