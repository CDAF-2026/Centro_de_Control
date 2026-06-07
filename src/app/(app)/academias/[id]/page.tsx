import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { rolesForModule, can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InscribirForm } from "./inscribir-form";
import { ListaEsperaForm } from "./lista-espera-form";
import { ProgramarForm } from "./programar-form";

const DIA_LABEL = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

export default async function AcademiaDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await requireRole(rolesForModule("academias"));
  const { id } = await params;
  const academiaId = Number(id);
  const supabase = await createClient();

  const { data: a } = await supabase.from("academias").select("*").eq("id", academiaId).single();
  if (!a) notFound();

  let profesorNombre: string | null = null;
  if (a.profesor_id) {
    const { data } = await supabase.from("profiles").select("nombre").eq("id", a.profesor_id).single();
    profesorNombre = data?.nombre ?? null;
  }

  const { data: inscripciones } = await supabase
    .from("inscripciones")
    .select("id, cliente_id, plan_frecuencia, descuento_pct")
    .eq("academia_id", academiaId);
  const clienteIds = (inscripciones ?? []).map((i) => i.cliente_id);
  const { data: inscritosClientes } = clienteIds.length
    ? await supabase.from("clientes").select("id, nombres, apellidos").in("id", clienteIds)
    : { data: [] };
  const nombrePorId = new Map((inscritosClientes ?? []).map((c) => [c.id, `${c.apellidos}, ${c.nombres}`]));

  const { count: clasesCount } = await supabase
    .from("clases")
    .select("*", { count: "exact", head: true })
    .eq("academia_id", academiaId);

  const { data: listaEspera } = await supabase
    .from("lista_espera")
    .select("id, nombre, contacto, nivel, edad, disponibilidad")
    .eq("academia_id", academiaId)
    .order("created_at");

  const puedeGestionar = can(profile.role, "academias", "edit");
  const puedeInscribir = ["superadmin", "coord_admin", "coord_deportivo", "recepcion"].includes(profile.role);

  const { data: clientesActivos } = puedeInscribir
    ? await supabase.from("clientes").select("id, nombres, apellidos").eq("estado", "activo").order("apellidos")
    : { data: [] };

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href="/academias" className="text-muted-foreground text-sm hover:underline">
          ← Academias
        </Link>
        <div className="mt-1 flex items-center gap-3">
          <h1 className="cdaf-headline">{a.nombre}</h1>
          <Badge variant={a.deporte === "tenis" ? "secondary" : "outline"}>{a.deporte}</Badge>
        </div>
        <p className="text-muted-foreground font-mono text-xs">{a.codigo}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Información</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm">
          <Dato label="Profesor" valor={profesorNombre} />
          <Dato label="Nivel" valor={a.nivel} />
          <Dato label="Cancha" valor={a.cancha} />
          <Dato label="Horario" valor={a.dias_semana.length ? `${a.dias_semana.map((d) => DIA_LABEL[d]).join(", ")} ${a.hora_inicio ?? ""}–${a.hora_fin ?? ""}` : null} />
          <Dato label="Precio" valor={COP.format(a.precio)} />
          <Dato label="Matrícula" valor={COP.format(a.matricula)} />
          <Dato label="Periodo" valor={a.periodo_inicio ? `${a.periodo_inicio} → ${a.periodo_fin ?? "?"}` : null} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Programación</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm">
            <strong>{clasesCount ?? 0}</strong> clases generadas para el periodo.
          </p>
          {puedeGestionar && <ProgramarForm academiaId={academiaId} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Inscritos ({inscripciones?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {(inscripciones ?? []).length > 0 ? (
            <ul className="divide-y text-sm">
              {(inscripciones ?? []).map((i) => (
                <li key={i.id} className="flex items-center justify-between py-2">
                  <span>{nombrePorId.get(i.cliente_id) ?? `Cliente #${i.cliente_id}`}</span>
                  <span className="text-muted-foreground">
                    {i.plan_frecuencia}×sem
                    {i.descuento_pct > 0 && ` · ${i.descuento_pct}% desc.`}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">Sin inscritos.</p>
          )}
          {puedeInscribir && (
            <div className="border-t pt-4">
              <InscribirForm academiaId={academiaId} clientes={clientesActivos ?? []} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lista de espera ({listaEspera?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {(listaEspera ?? []).length > 0 ? (
            <ul className="divide-y text-sm">
              {(listaEspera ?? []).map((l) => (
                <li key={l.id} className="py-2">
                  <span className="font-medium">{l.nombre}</span>{" "}
                  <span className="text-muted-foreground">
                    {[l.nivel, l.edad ? `${l.edad} años` : null, l.disponibilidad, l.contacto]
                      .filter(Boolean)
                      .join(" · ")}
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

function Dato({ label, valor }: { label: string; valor: string | null }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p>{valor ?? "—"}</p>
    </div>
  );
}
