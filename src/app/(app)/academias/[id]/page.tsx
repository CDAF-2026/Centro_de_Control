import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { rolesForModule, can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { mapaNombresStaff } from "@/lib/staff";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ListaEsperaForm } from "./lista-espera-form";
import { EliminarAcademiaButton } from "./eliminar-academia-button";
import { DIA_CORTO } from "../ui";

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

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

  const [{ data: servicio }, { data: matricula }, { data: listaEspera }, { data: retirados }, nombres] =
    await Promise.all([
      a.servicio_id
        ? supabase.from("servicios").select("nombre, siigo_grupo").eq("id", a.servicio_id).maybeSingle()
        : Promise.resolve({ data: null }),
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

  const ninos = matricula ?? [];
  const venidas = ninos.reduce((n, x) => n + x.n_clases, 0);
  // Un niño matriculado sin ningún día no viene a nada, y desde la matrícula no
  // se ve solo: por eso se cuenta aparte en vez de esconderlo en la lista.
  const sinDias = ninos.filter((x) => x.n_clases === 0);

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

      <section className="space-y-3">
        <h2 className="cdaf-title text-base">Matrícula</h2>
        {ninos.length === 0 ? (
          <p className="text-muted-foreground rounded-xl border border-dashed p-8 text-center text-sm">
            Esta academia todavía no tiene niños matriculados.
          </p>
        ) : (
          <div className="ring-foreground/[0.06] bg-card overflow-x-auto rounded-xl shadow-sm ring-1">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-border text-muted-foreground cdaf-eyebrow border-b text-[11px]">
                  <th className="px-4 py-3 text-left">Niño</th>
                  <th className="px-2 py-3 text-left">Edad</th>
                  <th className="px-2 py-3 text-left">Viene</th>
                  <th className="px-2 py-3 text-left">Desde</th>
                </tr>
              </thead>
              <tbody>
                {ninos.map((n) => (
                  <tr key={n.inscripcion_id} className="border-border/60 border-b last:border-0">
                    <td className="px-4 py-2.5">
                      <Link href={`/clientes/${n.cliente_id}`} className="font-medium hover:underline">
                        {n.nombre}
                      </Link>
                    </td>
                    <td className="text-muted-foreground px-2 py-2.5 tabular-nums">{n.edad ?? "—"}</td>
                    <td className="px-2 py-2.5">
                      {n.clases.length === 0 ? (
                        <span className="text-warning-foreground text-xs">sin día</span>
                      ) : (
                        <span className="flex flex-wrap gap-1">
                          {n.clases.map((c) => (
                            <Link
                              key={c.id}
                              href={`/academias/clase/${c.id}`}
                              className="border-border hover:border-lime inline-flex h-5 items-center rounded-4xl border px-2 text-[11px] tabular-nums"
                              title={c.profesorId ? nombres.get(c.profesorId) ?? "" : ""}
                            >
                              {DIA_CORTO[c.dia]} {c.hora}
                            </Link>
                          ))}
                        </span>
                      )}
                    </td>
                    <td className="text-muted-foreground px-2 py-2.5 tabular-nums">{n.desde}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Card>
        <CardHeader><CardTitle>Información</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm">
          <Dato label="Servicio en Siigo" valor={servicio?.nombre ?? null} />
          <Dato label="Grupo de producto" valor={servicio?.siigo_grupo ?? null} />
          <Dato label="Precio de referencia" valor={COP.format(a.precio)} />
          <Dato label="Matrícula de referencia" valor={COP.format(a.matricula)} />
        </CardContent>
        <CardContent className="pt-0">
          <p className="text-muted-foreground text-xs">
            El ingreso sale de las facturas de Siigo del servicio de arriba. Los valores de referencia
            son solo para consulta, no se usan para calcular.
          </p>
        </CardContent>
      </Card>

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

function Dato({ label, valor }: { label: string; valor: string | null }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p>{valor ?? "—"}</p>
    </div>
  );
}
