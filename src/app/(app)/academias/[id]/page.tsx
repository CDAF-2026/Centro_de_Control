import Link from "next/link";
import { notFound } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { rolesForModule, can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ListaEsperaForm } from "./lista-espera-form";
import { EliminarAcademiaButton } from "./eliminar-academia-button";
import { BarraOcupacion, ChipOcupacion, DIA_CORTO, NIVEL_LABEL } from "../ocupacion";

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

export default async function AcademiaDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireRole(rolesForModule("academias"));
  const { id } = await params;
  const academiaId = Number(id);
  const supabase = await createClient();

  const { data: a } = await supabase.from("academias").select("*").eq("id", academiaId).single();
  if (!a) notFound();

  const [{ data: servicio }, { data: grupos }, { data: listaEspera }] = await Promise.all([
    a.servicio_id
      ? supabase.from("servicios").select("nombre, siigo_grupo").eq("id", a.servicio_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.rpc("academia_grupos_resumen", { p_academia: academiaId }),
    supabase
      .from("lista_espera")
      .select("id, nombre, contacto, nivel, edad, disponibilidad")
      .eq("academia_id", academiaId)
      .order("created_at"),
  ]);

  const gs = grupos ?? [];
  const ninos = gs.reduce((n, g) => n + g.ninos, 0);
  const cupo = gs.reduce((n, g) => n + g.cupo_total, 0);
  const ocupados = gs.reduce((n, g) => n + g.ocupados, 0);
  const sobre = gs.reduce((n, g) => n + g.franjas_sobre_cupo, 0);
  const libres = Math.max(0, cupo - ocupados);

  const puedeGestionar = can(profile.role, "academias", "edit");
  const puedeInscribir = ["superadmin", "coord_admin", "coord_deportivo", "recepcion"].includes(profile.role);

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

      {/* Marcador: la pregunta del club es "¿dónde hay campo?" */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Grupos" valor={gs.length} />
        <Kpi label="Niños inscritos" valor={ninos} />
        <Kpi label="Cupos libres" valor={libres} tono={libres > 0 ? "ok" : undefined} />
        <Kpi label="Franjas sobre cupo" valor={sobre} tono={sobre > 0 ? "mal" : undefined} />
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="cdaf-title text-base">Grupos</h2>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Un grupo es un nivel y un rango de edad. Cada uno tiene sus propias franjas.
            </p>
          </div>
          {puedeGestionar && (
            <Link href={`/academias/${a.id}/grupos/nuevo`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              + Nuevo grupo
            </Link>
          )}
        </div>

        {gs.length === 0 ? (
          <p className="text-muted-foreground rounded-xl border border-dashed p-8 text-center text-sm">
            Esta academia todavía no tiene grupos.
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {gs.map((g) => (
              <Link
                key={g.grupo_id}
                href={`/academias/${a.id}/grupos/${g.grupo_id}`}
                className="hover:border-lime ring-foreground/[0.06] bg-card flex flex-col gap-3.5 rounded-xl p-4.5 shadow-sm ring-1 transition-all hover:-translate-y-0.5"
              >
                <div className="flex items-start justify-between gap-2.5">
                  <div>
                    <p className="cdaf-title text-lg">{g.nombre}</p>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {NIVEL_LABEL[g.nivel] ?? g.nivel} · {g.edad_min}–{g.edad_max} años
                    </p>
                  </div>
                  <ChipOcupacion ocupados={g.ocupados} cupo={g.cupo_total} />
                </div>

                <p className="flex items-baseline gap-1.5">
                  <span className="font-heading text-[28px] font-bold tabular-nums">{g.ninos}</span>
                  <span className="text-muted-foreground text-xs">
                    niños · {g.franjas} {g.franjas === 1 ? "franja" : "franjas"}
                  </span>
                </p>

                <div>
                  <div className="text-muted-foreground mb-1.5 flex justify-between text-[11px]">
                    <span>Ocupación</span>
                    <span className="tabular-nums">
                      {g.ocupados} de {g.cupo_total}
                    </span>
                  </div>
                  <BarraOcupacion ocupados={g.ocupados} cupo={g.cupo_total} />
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {g.dias.map((d) => (
                    <span key={d} className="border-border bg-card text-muted-foreground inline-flex h-5 items-center rounded-4xl border px-2 text-[11px]">
                      {DIA_CORTO[d]}
                    </span>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        )}

        {sobre > 0 && (
          <p className="border-warning/35 bg-warning/10 flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm text-[#6d4700]">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              {sobre === 1 ? "Una franja está" : `${sobre} franjas están`} por encima del cupo. Se puede
              inscribir igual — esto es un aviso, no un bloqueo.
            </span>
          </p>
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

      <Card>
        <CardHeader><CardTitle>Lista de espera ({listaEspera?.length ?? 0})</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {(listaEspera ?? []).length > 0 ? (
            <ul className="divide-y text-sm">
              {(listaEspera ?? []).map((l) => (
                <li key={l.id} className="py-2">
                  <span className="font-medium">{l.nombre}</span>{" "}
                  <span className="text-muted-foreground">
                    {[l.nivel, l.edad ? `${l.edad} años` : null, l.disponibilidad, l.contacto].filter(Boolean).join(" · ")}
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

function Kpi({ label, valor, tono }: { label: string; valor: number; tono?: "ok" | "mal" }) {
  const color = tono === "ok" ? "text-[#5b6300]" : tono === "mal" ? "text-destructive" : "";
  return (
    <div className="ring-foreground/[0.06] bg-card rounded-xl px-4.5 py-4 shadow-sm ring-1">
      <p className="cdaf-eyebrow text-muted-foreground text-[11px]">{label}</p>
      <p className={`font-heading mt-1 text-[26px] font-bold tabular-nums ${color}`}>{valor}</p>
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
