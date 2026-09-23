import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { rolesForModule, can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { mapaNombresStaff, docentesConDeporte, opcionesParaDeporte } from "@/lib/staff";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ListaEsperaForm } from "./lista-espera-form";
import { EliminarAcademiaButton } from "./eliminar-academia-button";
import { DIA_CORTO, DIA_LARGO, coloresDeProfesores } from "../ui";
import { MatriculaTabla, type FilaMatricula } from "./matricula-tabla";


/**
 * La ficha de una academia = su MATRÍCULA. Quién está, desde cuándo y a qué
 * clases viene. El horario no vive aquí: vive en el planeador, porque una misma
 * clase mezcla niños de recreativa y de competencia.
 */
export default async function AcademiaDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireRole(rolesForModule("academias"));
  const { id } = await params;
  const academiaId = Number(id);
  const supabase = await createClient();

  const { data: a } = await supabase.from("academias").select("*").eq("id", academiaId).single();
  if (!a) notFound();

  const [{ data: matricula }, { data: listaEspera }, { data: retirados }, nombres] =
    await Promise.all([
      supabase.rpc("academia_matricula", { p_academia: academiaId }),
      supabase
        .from("lista_espera")
        .select("id, nombre, contacto, edad, disponibilidad")
        .eq("academia_id", academiaId)
        .order("created_at"),
      supabase
        .from("inscripciones")
        .select("id, retirada_el, cliente_miembros(nombres, apellidos)")
        .eq("academia_id", academiaId)
        .eq("activa", false)
        .order("retirada_el", { ascending: false })
        .limit(20),
      mapaNombresStaff(),
    ]);
  const docentes = await docentesConDeporte();

  const ninos = matricula ?? [];
  const venidas = ninos.reduce((n, x) => n + x.n_clases, 0);
  // Un niño matriculado sin ningún día no viene a nada, y desde la matrícula no
  // se ve solo: por eso se cuenta aparte en vez de esconderlo en la lista.
  const sinDias = ninos.filter((x) => x.n_clases === 0);

  const lista = opcionesParaDeporte(docentes, a.deporte).map((p) => ({ id: p.id, nombre: p.nombre }));
  for (const n of ninos) for (const c of n.clases)
    if (c.profesorId && !lista.some((p) => p.id === c.profesorId)) lista.push({ id: c.profesorId, nombre: nombres.get(c.profesorId) ?? "—" });
  const color = coloresDeProfesores(lista);
  const filas: FilaMatricula[] = ninos.map((n) => ({
    inscripcionId: n.inscripcion_id,
    clienteId: n.cliente_id,
    nombre: n.nombre,
    edad: n.edad,
    desde: n.desde,
    clases: n.clases.map((c) => {
      const col = (c.profesorId && color.get(c.profesorId)) || { c: "#5f7079", s: "#eef1f2" };
      return {
        id: c.id,
        etiqueta: `${DIA_CORTO[c.dia]} ${c.hora}`,
        titulo: `${DIA_LARGO[c.dia]} ${c.hora} · ${c.profesorId ? nombres.get(c.profesorId) ?? "" : ""}`,
        color: col.c,
        fondo: col.s,
      };
    }),
  }));
  // Reparto REAL de la matrícula: cuántos vienen 1, 2 o 3+ veces, y por edades.
  const porVeces = [
    { etiqueta: "1 vez", valor: ninos.filter((n) => n.n_clases === 1).length },
    { etiqueta: "2 veces", valor: ninos.filter((n) => n.n_clases === 2).length },
    { etiqueta: "3 o más", valor: ninos.filter((n) => n.n_clases >= 3).length },
  ];
  const rangos: [string, number, number][] = [["3–6 años", 0, 6], ["7–9 años", 7, 9], ["10–12 años", 10, 12], ["13 años o más", 13, 99]];
  const porEdad = [
    ...rangos.map(([etiqueta, a, b]) => ({ etiqueta, valor: ninos.filter((n) => n.edad != null && n.edad >= a && n.edad <= b).length })),
    { etiqueta: "Sin fecha de nacimiento", valor: ninos.filter((n) => n.edad == null).length },
  ].filter((r) => r.valor > 0 || r.etiqueta !== "Sin fecha de nacimiento");

  const puedeGestionar = can(profile.role, "academias", "edit");
  const puedeInscribir = can(profile.role, "academias", "edit");

  return (
    <div className="space-y-6">
      <div>
        <Link href="/academias" className="text-muted-foreground text-sm hover:underline">← Academias</Link>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="cdaf-headline">{a.nombre}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant={a.deporte === "tenis" ? "secondary" : "outline"}>{a.deporte}</Badge>
              {a.categoria && <Badge variant="secondary" className="capitalize">{a.categoria}</Badge>}
              <span className="text-muted-foreground font-mono text-xs">{a.codigo}</span>
            </div>
          </div>
          {puedeGestionar && (
            <div className="flex items-center gap-2">
              <Link href={`/academias/${a.id}/editar`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                Editar
              </Link>
              <EliminarAcademiaButton academiaId={a.id} />
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi label="Niños matriculados" valor={ninos.length} />
        <Kpi label="Venidas a la semana" valor={venidas} />
        <Kpi label="Sin ningún día" valor={sinDias.length} tono={sinDias.length > 0 ? "mal" : undefined} />
      </div>

      {sinDias.length > 0 && (
        <p className="border-warning/35 bg-warning/10 rounded-xl border px-4 py-3 text-sm text-[#6d4700]">
          <strong>
            {sinDias.length === 1 ? "Un niño está matriculado" : `${sinDias.length} niños están matriculados`} sin
            venir a ninguna clase:
          </strong>{" "}
          {sinDias.map((n) => n.nombre).join(", ")}. Agrégalos a una clase desde el planeador o retíralos.
        </p>
      )}

      <section className="ring-foreground/[0.06] bg-card grid gap-6 rounded-xl p-5 shadow-sm ring-1 md:grid-cols-2">
        <Reparto titulo="Cuántas veces vienen a la semana" filas={porVeces} total={ninos.length} lima />
        <Reparto titulo="Por edad" filas={porEdad} total={ninos.length} />
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-base font-bold uppercase">Matrícula</h2>
        {ninos.length === 0 ? (
          <p className="text-muted-foreground rounded-xl border border-dashed p-8 text-center text-sm">
            Esta academia todavía no tiene niños matriculados.
          </p>
        ) : (
          <MatriculaTabla filas={filas} />
        )}
      </section>

      {(retirados ?? []).length > 0 && (
        <Card>
          <CardHeader><CardTitle>Retirados</CardTitle></CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {(retirados ?? []).map((r) => {
                const m = r.cliente_miembros as unknown as { nombres: string; apellidos: string } | null;
                return (
                  <li key={r.id} className="flex justify-between py-2">
                    <span>{m ? `${m.apellidos}, ${m.nombres}` : "—"}</span>
                    <span className="text-muted-foreground tabular-nums">{r.retirada_el ?? "—"}</span>
                  </li>
                );
              })}
            </ul>
            <p className="text-muted-foreground mt-3 text-xs">
              Retirar no borra: su asistencia y su cobro de los meses pasados tienen que poder explicarse.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Lista de espera ({listaEspera?.length ?? 0})</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {(listaEspera ?? []).length > 0 ? (
            <ul className="divide-y text-sm">
              {(listaEspera ?? []).map((l) => (
                <li key={l.id} className="py-2">
                  <span className="font-medium">{l.nombre}</span>{" "}
                  <span className="text-muted-foreground">
                    {[l.edad ? `${l.edad} años` : null, l.disponibilidad, l.contacto].filter(Boolean).join(" · ")}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">Lista de espera vacía.</p>
          )}
          {puedeInscribir && (
            <div className="border-t pt-4">
              <ListaEsperaForm academiaId={academiaId} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, valor, tono }: { label: string; valor: number; tono?: "mal" }) {
  return (
    <div className="ring-foreground/[0.06] bg-card rounded-xl px-4.5 py-4 shadow-sm ring-1">
      <p className="cdaf-eyebrow text-muted-foreground text-[11px]">{label}</p>
      <p className={`font-heading mt-1 text-[26px] font-bold tabular-nums ${tono === "mal" ? "text-destructive" : ""}`}>
        {valor}
      </p>
    </div>
  );
}

function Reparto({
  titulo,
  filas,
  total,
  lima = false,
}: {
  titulo: string;
  filas: { etiqueta: string; valor: number }[];
  total: number;
  lima?: boolean;
}) {
  return (
    <div className="space-y-2.5">
      <p className="text-muted-foreground text-[11px] font-bold tracking-wider uppercase">{titulo}</p>
      {filas.map((f) => (
        <div key={f.etiqueta} className="grid grid-cols-[minmax(92px,auto)_1fr_32px] items-center gap-3 text-[13px]">
          <span>{f.etiqueta}</span>
          <span className="bg-muted h-2.5 overflow-hidden rounded-full">
            <span
              className={`block h-full rounded-full ${lima ? "bg-lime" : "bg-[#37474f]"}`}
              style={{ width: `${total ? (f.valor / total) * 100 : 0}%` }}
            />
          </span>
          <span className="font-heading text-right font-bold tabular-nums">{f.valor}</span>
        </div>
      ))}
    </div>
  );
}
