import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { rolesForModule, can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { docentesConDeporte, opcionesParaDeporte } from "@/lib/staff";
import { pausaActual, fechaCorta } from "@/lib/academias";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DIA_LARGO, DIAS_SEMANA, hhmm, horaFin, coloresDeProfesores, nombreCorto } from "./ui";
import { PausaAcademias } from "./pausa";

/**
 * El planeador de la semana, como PARRILLA POR HORA (rediseño 23-sep-2026,
 * opción A). Cada fila es una hora de inicio y cada columna un día, así que el
 * martes 16:30 queda a la par del jueves 16:30 — lo que la versión anterior no
 * hacía: apilaba las clases de cada día sin alinearlas y se leía desordenado.
 * Cada profesor lleva su color en todas las pantallas del módulo.
 */
export default async function AcademiasPage({
  searchParams,
}: {
  searchParams: Promise<{ aviso?: string }>;
}) {
  const profile = await requireRole(rolesForModule("academias"));
  const { aviso } = await searchParams;
  const supabase = await createClient();
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());

  const [{ data: clases }, { data: academias }, docentes, pausa, { data: festivos }] = await Promise.all([
    supabase.rpc("planeador_semana", { p_deporte: "tenis" }),
    supabase.from("academias").select("id, nombre, deporte, activa").order("deporte", { ascending: false }).order("categoria"),
    docentesConDeporte(),
    pausaActual(supabase),
    supabase.from("festivo").select("fecha, nombre").gte("fecha", hoy).order("fecha").limit(4),
  ]);

  const cs = clases ?? [];
  // Todos los docentes de tenis, también los que aún no tienen clases: un
  // profesor nuevo tiene que verse para poder asignarle la primera.
  const profesores = opcionesParaDeporte(docentes, "tenis").map((p) => ({ id: p.id, nombre: p.nombre }));
  // Si alguien tiene clases pero ya no sale como docente, igual necesita color y nombre.
  for (const c of cs) if (!profesores.some((p) => p.id === c.profesor_id)) profesores.push({ id: c.profesor_id, nombre: "—" });
  const color = coloresDeProfesores(profesores);
  const nombreDe = new Map(profesores.map((p) => [p.id, p.nombre]));

  const total = { clases: cs.length, ninos: cs.reduce((n, c) => n + c.ninos, 0), horas: cs.reduce((n, c) => n + c.duracion_min, 0) / 60 };
  const conClases = new Set(cs.map((c) => c.profesor_id));
  const horas = [...new Set(cs.map((c) => hhmm(c.hora_inicio)))].sort();
  const manana = horas.filter((h) => h < "13:00");
  const tarde = horas.filter((h) => h >= "13:00");
  const puedeEditar = can(profile.role, "academias", "edit");

  const fila = (h: string) => (
    <div key={h} className="contents">
      <div className="font-heading text-muted-foreground border-t border-[#f0f3f3] px-3 py-2.5 text-xs font-semibold tabular-nums">
        {h}
      </div>
      {DIAS_SEMANA.map((d) => (
        <div key={d} className="flex min-h-10 flex-col gap-1 border-t border-l border-[#f0f3f3] p-1.5">
          {cs
            .filter((c) => c.dia_semana === d && hhmm(c.hora_inicio) === h)
            .map((c) => {
              const col = color.get(c.profesor_id)!;
              const nombre = nombreDe.get(c.profesor_id) ?? "—";
              return (
                <Link
                  key={c.clase_id}
                  href={`/academias/clase/${c.clase_id}`}
                  title={`${nombre} · ${DIA_LARGO[d]} ${h}–${horaFin(c.hora_inicio, c.duracion_min)} · ${c.ninos} ${c.ninos === 1 ? "niño" : "niños"}${c.competencia ? ` (${c.competencia} de competencia)` : ""}`}
                  className="flex items-center justify-between gap-1.5 rounded-md border-l-[3px] px-2 py-1.5 text-xs leading-tight transition-shadow hover:shadow-md"
                  style={{ background: col.s, borderLeftColor: col.c }}
                >
                  <span className="truncate">
                    {nombreCorto(nombre)}
                    {c.competencia > 0 && (
                      <span className="font-heading ml-1 text-[9.5px] font-bold tracking-wide" style={{ color: col.c }}>
                        COMP
                      </span>
                    )}
                  </span>
                  <span className="font-heading text-[13px] font-bold tabular-nums">{c.ninos}</span>
                </Link>
              );
            })}
        </div>
      ))}
    </div>
  );

  const separador = (t: string) => (
    <div className="text-muted-foreground/80 col-span-full bg-[#f0f3f3] px-3 py-1.5 text-[10.5px] font-bold tracking-wider uppercase">
      {t}
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="cdaf-headline">Academias</h1>
          <p className="text-muted-foreground mt-1.5 text-sm">La semana del club: qué dicta cada profesor y quiénes vienen.</p>
        </div>
        {puedeEditar && (
          <Link href="/academias/clase/nueva" className={buttonVariants()}>+ Nueva clase</Link>
        )}
      </div>

      {aviso && <p className="border-lime/50 bg-lime/10 rounded-xl border px-4 py-3 text-sm">{aviso}</p>}

      <PausaAcademias pausaDesde={pausa ? fechaCorta(pausa.desde) : null} hoy={hoy} puedeEditar={puedeEditar} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Clases a la semana" valor={total.clases} />
        <Kpi label="Niños por semana" valor={total.ninos} />
        <Kpi label="Horas de cancha" valor={String(total.horas).replace(".", ",")} />
        <Kpi label="Profesores con clases" valor={conClases.size} />
      </div>

      <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1.5 text-[12.5px]">
        {profesores
          .filter((p) => p.nombre !== "—")
          .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
          .map((p) => (
          <Link key={p.id} href={`/academias/profesor/${p.id}`} className="inline-flex items-center gap-1.5 hover:underline">
            <span className="size-2.5 rounded-[3px]" style={{ background: color.get(p.id)!.c }} />
            {nombreCorto(p.nombre)}
            {!conClases.has(p.id) && <span className="text-muted-foreground/70">· sin clases</span>}
          </Link>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="font-heading text-[10px] font-bold tracking-wide">COMP</span> hay niños de competencia
        </span>
      </div>

      <div className="relative">
        <div className={`ring-foreground/[0.06] bg-card overflow-x-auto rounded-xl shadow-sm ring-1 ${pausa ? "opacity-45 saturate-[.3]" : ""}`}>
          <div className="grid min-w-[840px] grid-cols-[62px_repeat(6,minmax(122px,1fr))]">
            <div className="border-border border-b" />
            {DIAS_SEMANA.map((d) => {
              const delDia = cs.filter((c) => c.dia_semana === d);
              return (
                <div key={d} className="border-border border-b px-3 py-3">
                  <p className="text-muted-foreground text-[11px] font-bold tracking-wider uppercase">{DIA_LARGO[d]}</p>
                  <p className="text-muted-foreground/80 mt-0.5 text-[11px] tabular-nums">
                    {delDia.length} clases · {delDia.reduce((n, c) => n + c.ninos, 0)} niños
                  </p>
                </div>
              );
            })}
            {manana.length > 0 && separador("Mañana")}
            {manana.map(fila)}
            {tarde.length > 0 && separador("Tarde")}
            {tarde.map(fila)}
          </div>
        </div>
        {pausa && (
          <span className="bg-warning absolute top-3 right-3 rounded-full px-3 py-1.5 text-[11px] font-bold tracking-wide text-[#2a1c00] uppercase">
            En pausa · no se piden cierres
          </span>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
        <section className="space-y-2">
          <h2 className="text-muted-foreground text-[11px] font-bold tracking-wider uppercase">Matrícula por academia</h2>
          <div className="flex flex-wrap gap-2">
            {(academias ?? []).map((a) => (
              <Link
                key={a.id}
                href={`/academias/${a.id}`}
                className="hover:border-lime ring-foreground/[0.06] bg-card inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm shadow-sm ring-1"
              >
                {a.nombre}
                {!a.activa && <Badge variant="outline">Inactiva</Badge>}
              </Link>
            ))}
          </div>
        </section>
        {(festivos ?? []).length > 0 && (
          <section className="space-y-2">
            <h2 className="text-muted-foreground text-[11px] font-bold tracking-wider uppercase">Próximos festivos · sin academia</h2>
            <div className="flex flex-wrap gap-1.5">
              {(festivos ?? []).map((f) => (
                <Badge key={f.fecha} variant="outline" className="font-normal">
                  <span className="tabular-nums">{fechaCorta(f.fecha)}</span>&nbsp;· {f.nombre}
                </Badge>
              ))}
            </div>
          </section>
        )}
      </div>
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
