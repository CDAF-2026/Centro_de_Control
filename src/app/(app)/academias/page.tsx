import Link from "next/link";
import { CalendarDays, ChevronRight, GraduationCap, Users } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { rolesForModule, can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { docentesConDeporte, opcionesParaDeporte } from "@/lib/staff";
import { pausaActual, fechaCorta, puedePausarAcademias } from "@/lib/academias";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DIA_LARGO,
  DIAS_SEMANA,
  hhmm,
  horaFin,
  coloresDeProfesores,
  deporteDe,
  DEPORTE_NOMBRE,
} from "./ui";
import { PausaAcademias } from "./pausa";

/**
 * El planeador de la semana, POR PROFESOR (rediseño 23-sep-2026, opción C):
 * una fila por profesor × los 6 días, cada casilla con sus horas y cuántos
 * niños van. Reemplazó a la parrilla por hora, que con 13 filas de horas se
 * estiraba y obligaba a hacer scroll. Cada profesor lleva su color en todas
 * las pantallas del módulo.
 */
export default async function AcademiasPage({
  searchParams,
}: {
  searchParams: Promise<{ aviso?: string; deporte?: string }>;
}) {
  const profile = await requireRole(rolesForModule("academias"));
  const { aviso, deporte: dep } = await searchParams;
  const deporte = deporteDe(dep);
  const q = deporte === "padel" ? "?deporte=padel" : "";
  const supabase = await createClient();
  const hoy = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
  }).format(new Date());

  const [
    { data: clases },
    { data: academias },
    docentes,
    pausa,
    { data: matriculados },
  ] = await Promise.all([
    supabase.rpc("planeador_semana", { p_deporte: deporte }),
    supabase
      .from("academias")
      .select("id, nombre, deporte, categoria, activa")
      .order("deporte", { ascending: false })
      .order("categoria"),
    docentesConDeporte(),
    pausaActual(supabase),
    // Solo la columna academia_id de las inscripciones activas (~110 filas):
    // alcanza para contar por academia sin un RPC.
    supabase.from("inscripciones").select("academia_id").eq("activa", true),
  ]);
  const ninosPorAcademia = new Map<number, number>();
  for (const i of matriculados ?? [])
    ninosPorAcademia.set(
      i.academia_id,
      (ninosPorAcademia.get(i.academia_id) ?? 0) + 1,
    );

  const cs = clases ?? [];
  // Todos los docentes del deporte, también los que aún no tienen clases: un
  // profesor nuevo tiene que verse para poder asignarle la primera.
  const profesores = opcionesParaDeporte(docentes, deporte).map((p) => ({
    id: p.id,
    nombre: p.nombre,
  }));
  // Si alguien tiene clases pero ya no sale como docente, igual necesita color y nombre.
  for (const c of cs)
    if (!profesores.some((p) => p.id === c.profesor_id))
      profesores.push({ id: c.profesor_id, nombre: "—" });
  const color = coloresDeProfesores(profesores);
  const nombreDe = new Map(profesores.map((p) => [p.id, p.nombre]));

  const total = {
    clases: cs.length,
    ninos: cs.reduce((n, c) => n + c.ninos, 0),
    horas: cs.reduce((n, c) => n + c.duracion_min, 0) / 60,
  };
  const conClases = new Set(cs.map((c) => c.profesor_id));
  const puedeEditar = can(profile.role, "academias", "edit");
  const filas = profesores
    .filter((p) => p.nombre !== "—" || conClases.has(p.id))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="cdaf-headline">Academias</h1>
          <p className="text-muted-foreground mt-1.5 text-sm">
            La semana del club: qué dicta cada profesor y quiénes vienen.
          </p>
        </div>
        {puedeEditar && (
          <Link href={`/academias/clase/nueva?deporte=${deporte}`} className={buttonVariants()}>
            + Nueva clase
          </Link>
        )}
      </div>

      {/* Un planeador por deporte: tenis y pádel no comparten profesores ni canchas. */}
      <nav className="bg-card ring-foreground/[0.06] inline-flex rounded-lg p-1 shadow-sm ring-1">
        {(["tenis", "padel"] as const).map((d) => (
          <Link
            key={d}
            href={d === "padel" ? "/academias?deporte=padel" : "/academias"}
            aria-current={d === deporte ? "page" : undefined}
            className={`rounded-md px-4 py-1.5 text-sm font-semibold transition-colors ${
              d === deporte ? "bg-stadium text-white" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {DEPORTE_NOMBRE[d]}
          </Link>
        ))}
      </nav>

      {aviso && (
        <p className="border-lime/50 bg-lime/10 rounded-xl border px-4 py-3 text-sm">
          {aviso}
        </p>
      )}

      {/* Solo el superadministrador pausa y reactiva. A los demás no les sale el
          botón, pero SÍ el aviso de pausa: es lo que avisa si alguien olvidó reactivar. */}
      {(pausa || puedePausarAcademias(profile.role)) && (
        <PausaAcademias
          pausaDesde={pausa ? fechaCorta(pausa.desde) : null}
          hoy={hoy}
          puedePausar={puedePausarAcademias(profile.role)}
        />
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Clases a la semana" valor={total.clases} />
        <Kpi label="Niños por semana" valor={total.ninos} />
        <Kpi
          label="Horas de cancha"
          valor={String(total.horas).replace(".", ",")}
        />
        <Kpi label="Profesores con clases" valor={conClases.size} />
      </div>

      {/* El planeador POR PROFESOR (rediseño 23-sep-2026, opción C): una fila
          por profesor y en cada día sus horas. La parrilla por hora se estiraba
          a ~930 px con scroll; así cabe entera, y la fila del profesor hace
          también de leyenda del color y de puerta a su semana. */}
      <div className="relative">
        <div
          className={`ring-foreground/[0.06] bg-card overflow-x-auto rounded-xl shadow-sm ring-1 ${pausa ? "opacity-45 saturate-[.3]" : ""}`}
        >
          <div className="grid min-w-[960px] grid-cols-[260px_repeat(6,minmax(112px,1fr))]">
            <div className="border-border text-muted-foreground border-b px-4 py-3 text-[11px] font-bold tracking-wider uppercase">
              Profesor
            </div>
            {DIAS_SEMANA.map((d) => {
              const delDia = cs.filter((c) => c.dia_semana === d);
              return (
                <div key={d} className="border-border border-b px-3 py-3">
                  <p className="text-muted-foreground text-[11px] font-bold tracking-wider uppercase">
                    {DIA_LARGO[d]}
                  </p>
                  <p className="text-muted-foreground/80 mt-0.5 text-[11px] tabular-nums">
                    {delDia.length} clases ·{" "}
                    {delDia.reduce((n, c) => n + c.ninos, 0)} niños
                  </p>
                </div>
              );
            })}

            {filas.map((p) => {
              const col = color.get(p.id)!;
              const suyas = cs.filter((c) => c.profesor_id === p.id);
              const ninos = suyas.reduce((n, c) => n + c.ninos, 0);
              const iniciales = p.nombre
                .split(" ")
                .slice(0, 2)
                .map((x) => x[0])
                .join("")
                .toUpperCase();
              return (
                <div key={p.id} className="contents">
                  <Link
                    href={`/academias/profesor/${p.id}${q}`}
                    className="group flex items-center gap-3 border-t border-[#f0f3f3] px-4 py-3 transition-colors hover:bg-[#f7f9f8]"
                  >
                    <span
                      className="font-heading flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                      style={{
                        background: col.s,
                        color: col.c,
                        boxShadow: `inset 0 0 0 2px ${col.c}`,
                      }}
                    >
                      {iniciales}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="font-heading block text-[14.5px] leading-snug font-semibold">
                        {p.nombre}
                      </span>
                      {suyas.length ? (
                        <span className="text-muted-foreground mt-0.5 flex items-center gap-3 text-xs whitespace-nowrap tabular-nums">
                          <span className="inline-flex items-center gap-1">
                            <CalendarDays
                              className="size-3.5"
                              style={{ color: col.c }}
                            />
                            {suyas.length} clases
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Users
                              className="size-3.5"
                              style={{ color: col.c }}
                            />
                            {ninos} niños
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground mt-0.5 block text-xs">
                          Sin clases todavía
                        </span>
                      )}
                    </span>
                    <ChevronRight className="text-muted-foreground/50 size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
                  </Link>

                  {suyas.length === 0 ? (
                    <div className="text-muted-foreground col-span-6 flex items-center border-t border-l border-[#f0f3f3] px-4 text-xs">
                      {puedeEditar ? (
                        <Link
                          href={`/academias/clase/nueva?profesor=${p.id}&deporte=${deporte}`}
                          className="hover:text-foreground font-semibold underline-offset-2 hover:underline"
                        >
                          + Crearle su primera clase
                        </Link>
                      ) : (
                        "Aún no tiene clases en el planeador."
                      )}
                    </div>
                  ) : (
                    DIAS_SEMANA.map((d) => {
                      const delDia = suyas
                        .filter((c) => c.dia_semana === d)
                        .sort((a, b) =>
                          a.hora_inicio.localeCompare(b.hora_inicio),
                        );
                      return (
                        <div
                          key={d}
                          className="flex flex-wrap content-start gap-1 border-t border-l border-[#f0f3f3] p-2"
                          style={
                            delDia.length
                              ? undefined
                              : {
                                  background:
                                    "repeating-linear-gradient(135deg, transparent 0 6px, #f7f9f8 6px 12px)",
                                }
                          }
                        >
                          {delDia.map((c) => (
                            <Link
                              key={c.clase_id}
                              href={`/academias/clase/${c.clase_id}`}
                              title={`${DIA_LARGO[d]} ${hhmm(c.hora_inicio)}–${horaFin(c.hora_inicio, c.duracion_min)} · ${c.colegio ? `colegio ${c.colegio}` : `${c.ninos} ${c.ninos === 1 ? "niño" : "niños"}`}`}
                              className="inline-flex h-6 items-center gap-1.5 rounded-md border-l-[3px] px-2 text-xs font-semibold tabular-nums transition-shadow hover:shadow-md"
                              style={{ background: col.s, borderLeftColor: col.c }}
                            >
                              {hhmm(c.hora_inicio)}
                              <span
                                className="font-heading font-bold"
                                style={{ color: col.c }}
                              >
                                {c.colegio ?? c.ninos}
                              </span>
                            </Link>
                          ))}
                        </div>
                      );
                    })
                  )}
                </div>
              );
            })}
          </div>
        </div>
        {pausa && (
          <span className="bg-warning absolute top-3 right-3 rounded-full px-3 py-1.5 text-[11px] font-bold tracking-wide text-[#2a1c00] uppercase">
            En pausa · no se piden cierres
          </span>
        )}
      </div>

      <p className="text-muted-foreground -mt-2 text-xs">
        Cada casilla es la hora de la clase y cuántos niños van. Toca una hora
        para ver quiénes vienen, o el profesor para ver su semana.
      </p>

      {/* La matrícula es el lado del COBRO (cada academia apunta a su servicio de
          Siigo). Va al final porque la pantalla es del planeador, pero en
          tarjetas con su número: una fila de nombres sueltos no decía nada. */}
      <section className="space-y-2.5">
        <h2 className="font-heading text-sm font-bold uppercase">Matrícula</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[...(academias ?? [])]
            // Tenis primero (es la que opera hoy) y dentro de cada deporte la recreativa, que es la grande.
            .sort(
              (a, b) =>
                Number(a.deporte !== "tenis") - Number(b.deporte !== "tenis") ||
                Number(a.categoria !== "recreativa") -
                  Number(b.categoria !== "recreativa"),
            )
            .map((a) => {
              const n = ninosPorAcademia.get(a.id) ?? 0;
              return (
                <Link
                  key={a.id}
                  href={`/academias/${a.id}`}
                  className="group ring-foreground/[0.06] bg-card flex flex-col gap-3 rounded-xl p-4 shadow-sm ring-1 transition-all hover:-translate-y-0.5 hover:shadow-md"
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="bg-lime/15 ring-lime/25 flex size-9 items-center justify-center rounded-lg ring-1">
                      <GraduationCap className="size-4.5 text-[#5b6300]" />
                    </span>
                    <span className="flex flex-wrap justify-end gap-1">
                      <Badge variant="secondary" className="capitalize">
                        {a.deporte === "padel" ? "pádel" : a.deporte}
                      </Badge>
                      {!a.activa && <Badge variant="outline">Inactiva</Badge>}
                    </span>
                  </span>
                  <span>
                    <span className="font-heading block text-[15px] leading-snug font-semibold">
                      {a.nombre}
                    </span>
                    <span className="mt-1 flex items-baseline gap-1.5">
                      <span
                        className={`font-heading text-2xl font-bold tabular-nums ${n ? "" : "text-muted-foreground/60"}`}
                      >
                        {n}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {n ? "niños matriculados" : "sin niños todavía"}
                      </span>
                    </span>
                  </span>
                  <span className="text-muted-foreground group-hover:text-foreground mt-auto inline-flex items-center gap-1 text-xs font-semibold">
                    Ver matrícula <ChevronRight className="size-3.5" />
                  </span>
                </Link>
              );
            })}
        </div>
      </section>
    </div>
  );
}

function Kpi({ label, valor }: { label: string; valor: number | string }) {
  return (
    <div className="ring-foreground/[0.06] bg-card rounded-xl px-4 py-3 shadow-sm ring-1">
      <p className="text-muted-foreground text-[11px] font-bold tracking-wider uppercase">
        {label}
      </p>
      <p className="font-heading mt-0.5 text-[26px] font-bold tabular-nums">
        {valor}
      </p>
    </div>
  );
}
