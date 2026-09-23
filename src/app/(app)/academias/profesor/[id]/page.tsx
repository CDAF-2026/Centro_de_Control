import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { rolesForModule, can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { docentesConDeporte, mapaNombresStaff, opcionesParaDeporte } from "@/lib/staff";
import { buttonVariants } from "@/components/ui/button";
import { DIA_LARGO, DIAS_SEMANA, hhmm, horaFin, coloresDeProfesores, deporteDe, DEPORTE_NOMBRE } from "../../ui";

const aMin = (t: string) => {
  const [h, m] = hhmm(t).split(":").map(Number);
  return h * 60 + m;
};
const HORA_PX = 48;

/**
 * La semana de un profesor como CALENDARIO CON HORAS (rediseño 23-sep-2026,
 * opción B): el alto de cada clase es su duración, así que se ven de una los
 * huecos libres — que es lo que el coordinador busca para meter una reposición.
 *
 * ⚠️ El planeador del club cuenta UNA FILA DE NIÑO como media hora de profesor
 * (el martes de Graciano marcaba 175%). Aquí las horas son de CLASE y los niños
 * se cuentan aparte.
 */
export default async function ProfesorSemanaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ deporte?: string }>;
}) {
  const profile = await requireRole(rolesForModule("academias"));
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const supabase = await createClient();

  const docentes = await docentesConDeporte();
  // El deporte llega por la URL desde el planeador; si no, el que tenga marcado
  // el profesor (un profe solo de pádel abre su semana de pádel).
  const marcados = docentes.find((d) => d.id === id)?.deportes ?? [];
  const deporte = deporteDe(sp.deporte ?? (marcados.includes("padel") && !marcados.includes("tenis") ? "padel" : "tenis"));
  const [{ data: clases }, nombres] = await Promise.all([
    supabase.rpc("planeador_semana", { p_deporte: deporte }),
    mapaNombresStaff(),
  ]);

  const suyas = (clases ?? []).filter((c) => c.profesor_id === id);
  const docente = docentes.find((d) => d.id === id);
  // No se exige que siga siendo docente activo: si le dan de baja a alguien,
  // sus clases tienen que seguir alcanzables para reasignarlas.
  if (!docente && suyas.length === 0) notFound();
  const nombre = docente?.nombre ?? nombres.get(id) ?? "Profesor";

  // Mismo color que en el planeador: se calcula sobre la misma lista.
  const lista = opcionesParaDeporte(docentes, deporte).map((p) => ({ id: p.id, nombre: p.nombre }));
  if (!lista.some((p) => p.id === id)) lista.push({ id, nombre });
  const col = coloresDeProfesores(lista).get(id)!;

  const ninos = suyas.reduce((n, c) => n + c.ninos, 0);
  const horas = suyas.reduce((n, c) => n + c.duracion_min, 0) / 60;
  const desde = suyas.length ? Math.floor(Math.min(...suyas.map((c) => aMin(c.hora_inicio))) / 60) * 60 : 0;
  const hasta = suyas.length ? Math.ceil(Math.max(...suyas.map((c) => aMin(c.hora_inicio) + c.duracion_min)) / 60) * 60 : 0;
  const alto = ((hasta - desde) / 60) * HORA_PX;
  const marcas: number[] = [];
  for (let m = desde; m <= hasta; m += 60) marcas.push(m);
  const puedeEditar = can(profile.role, "academias", "edit");

  return (
    <div className="space-y-5">
      <div>
        <Link href={deporte === "padel" ? "/academias?deporte=padel" : "/academias"} className="text-muted-foreground text-sm hover:underline">← Academias de {DEPORTE_NOMBRE[deporte].toLowerCase()}</Link>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="size-3.5 rounded-[4px]" style={{ background: col.c }} />
            <div>
              <h1 className="cdaf-headline">{nombre}</h1>
              <p className="text-muted-foreground text-sm">Sus academias de {DEPORTE_NOMBRE[deporte].toLowerCase()} de la semana.</p>
            </div>
          </div>
          {puedeEditar && (
            <Link href={`/academias/clase/nueva?profesor=${id}&deporte=${deporte}`} className={buttonVariants({ size: "sm" })}>
              + Nueva clase
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Kpi label="Clases a la semana" valor={suyas.length} />
        <Kpi label="Niños por semana" valor={ninos} />
        <Kpi label="Horas de cancha" valor={String(horas).replace(".", ",")} />
      </div>

      {suyas.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border border-dashed p-8 text-center text-sm">
          Todavía no tiene ninguna clase asignada.
        </p>
      ) : (
        <div className="ring-foreground/[0.06] bg-card overflow-x-auto rounded-xl shadow-sm ring-1">
          <div className="grid min-w-[700px] grid-cols-[56px_repeat(6,minmax(96px,1fr))]">
            <div className="border-border border-b" />
            {DIAS_SEMANA.map((d) => {
              const delDia = suyas.filter((c) => c.dia_semana === d);
              return (
                <div key={d} className="border-border border-b px-2 py-2.5 text-center">
                  <p className="text-muted-foreground text-[11px] font-bold tracking-wider uppercase">{DIA_LARGO[d]}</p>
                  <p className="text-muted-foreground/80 text-[11px] tabular-nums">
                    {delDia.length ? `${delDia.length} · ${delDia.reduce((n, c) => n + c.ninos, 0)} niños` : "libre"}
                  </p>
                </div>
              );
            })}

            <div className="relative mt-3 mb-4" style={{ height: alto }}>
              {marcas.map((m) => (
                <span
                  key={m}
                  className="font-heading text-muted-foreground/80 absolute right-2 -translate-y-1/2 text-[11px] font-semibold tabular-nums"
                  style={{ top: ((m - desde) / 60) * HORA_PX }}
                >
                  {String(Math.floor(m / 60)).padStart(2, "0")}:00
                </span>
              ))}
            </div>
            {DIAS_SEMANA.map((d) => (
              <div
                key={d}
                className="relative mt-3 mb-4 border-l border-[#f0f3f3]"
                style={{
                  height: alto,
                  backgroundImage: "linear-gradient(to bottom, #f0f3f3 1px, transparent 1px)",
                  backgroundSize: `100% ${HORA_PX}px`,
                }}
              >
                {suyas
                  .filter((c) => c.dia_semana === d)
                  .map((c) => (
                    <Link
                      key={c.clase_id}
                      href={`/academias/clase/${c.clase_id}`}
                      title={`${hhmm(c.hora_inicio)}–${horaFin(c.hora_inicio, c.duracion_min)} · ${c.colegio ? `colegio ${c.colegio}` : `${c.ninos} ${c.ninos === 1 ? "niño" : "niños"}`}`}
                      className="absolute right-1 left-1 overflow-hidden rounded-md border-l-[3px] px-2 py-1 text-[11.5px] leading-tight transition-shadow hover:shadow-md"
                      style={{
                        top: ((aMin(c.hora_inicio) - desde) / 60) * HORA_PX + 1,
                        height: (c.duracion_min / 60) * HORA_PX - 3,
                        background: col.s,
                        borderLeftColor: col.c,
                      }}
                    >
                      <span className="font-heading font-bold tabular-nums">{hhmm(c.hora_inicio)}</span>
                      <span className="text-muted-foreground"> · {c.colegio ?? `${c.ninos} ${c.ninos === 1 ? "niño" : "niños"}`}</span>
                    </Link>
                  ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, valor }: { label: string; valor: number | string }) {
  return (
    <div className="ring-foreground/[0.06] bg-card rounded-xl px-4 py-3 shadow-sm ring-1">
      <p className="text-muted-foreground text-[11px] font-bold tracking-wider uppercase">{label}</p>
      <p className="font-heading mt-0.5 text-[26px] font-bold tabular-nums">{valor}</p>
    </div>
  );
}
