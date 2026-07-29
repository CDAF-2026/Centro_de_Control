import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { rolesForModule, can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { nombreStaff } from "@/lib/staff";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { InscribirForm } from "./inscribir-form";
import { ListaEsperaForm } from "./lista-espera-form";
import { EliminarAcademiaButton } from "./eliminar-academia-button";

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

  const profesorNombre = await nombreStaff(a.profesor_id);

  const { data: inscripciones } = await supabase
    .from("inscripciones")
    .select("id, cliente_id, miembro_id, plan_frecuencia, descuento_pct, dias")
    .eq("academia_id", academiaId);
  // El inscrito es el MIEMBRO (hermano); si faltara, se cae al nombre de la ficha.
  const miembroIds = (inscripciones ?? []).map((i) => i.miembro_id).filter((x): x is number => x != null);
  const clienteIds = (inscripciones ?? []).map((i) => i.cliente_id);
  const [{ data: inscritosMiembros }, { data: inscritosClientes }] = await Promise.all([
    miembroIds.length ? supabase.from("cliente_miembros").select("id, nombres, apellidos").in("id", miembroIds) : Promise.resolve({ data: [] as { id: number; nombres: string; apellidos: string }[] }),
    clienteIds.length ? supabase.from("clientes").select("id, nombres, apellidos").in("id", clienteIds) : Promise.resolve({ data: [] as { id: number; nombres: string; apellidos: string }[] }),
  ]);
  const nombreMiembro = new Map((inscritosMiembros ?? []).map((m) => [m.id, `${m.apellidos}, ${m.nombres}`]));
  const nombreCliente = new Map((inscritosClientes ?? []).map((c) => [c.id, `${c.apellidos}, ${c.nombres}`]));
  const nombreInscrito = (i: { miembro_id: number | null; cliente_id: number }) =>
    (i.miembro_id != null ? nombreMiembro.get(i.miembro_id) : null) ?? nombreCliente.get(i.cliente_id) ?? `Cliente #${i.cliente_id}`;

  // Sobre-asistencia: presentes del mes en esta academia, por miembro.
  const ymMes = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  const { data: clasesMes } = await supabase
    .from("clases")
    .select("id")
    .eq("academia_id", academiaId)
    .gte("fecha", `${ymMes}-01`)
    .lte("fecha", `${ymMes}-31`);
  const presentesMes = new Map<number, number>();
  const idsMes = (clasesMes ?? []).map((c) => c.id);
  if (idsMes.length) {
    const { data: asisMes } = await supabase.from("asistencias").select("miembro_id, presente, estado").in("clase_id", idsMes);
    for (const a of asisMes ?? []) {
      const ok = a.estado ? a.estado === "presente" : a.presente;
      if (ok && a.miembro_id != null) presentesMes.set(a.miembro_id, (presentesMes.get(a.miembro_id) ?? 0) + 1);
    }
  }

  const { data: listaEspera } = await supabase
    .from("lista_espera")
    .select("id, nombre, contacto, nivel, edad, disponibilidad")
    .eq("academia_id", academiaId)
    .order("created_at");

  const puedeGestionar = can(profile.role, "academias", "edit");
  const puedeInscribir = ["superadmin", "coord_admin", "coord_deportivo", "recepcion"].includes(profile.role);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href="/academias" className="text-muted-foreground text-sm hover:underline">
          ← Academias
        </Link>
        <div className="mt-1 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="cdaf-headline">{a.nombre}</h1>
            <Badge variant={a.deporte === "tenis" ? "secondary" : "outline"}>{a.deporte}</Badge>
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

      {/* La programación ya no nace aquí: las clases entran desde la reserva de
          EasyCancha y se registran en el calendario (decidido con el club, jul-2026). */}
      <Card>
        <CardHeader>
          <CardTitle>Clases</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Las clases de academia entran desde la reserva de EasyCancha. Ábrela en el{" "}
            <Link href="/clases" className="underline">calendario de clases</Link> y regístrala con el
            botón <strong>Academia</strong>; la asistencia se toma en{" "}
            <Link href="/cierre" className="underline">cierre de clases</Link>.
          </p>
        </CardContent>
      </Card>

      <Card className="overflow-visible">
        <CardHeader>
          <CardTitle>Inscritos ({inscripciones?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {(inscripciones ?? []).length > 0 ? (
            <ul className="divide-y text-sm">
              {(inscripciones ?? []).map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="flex flex-wrap items-center gap-2">
                    {nombreInscrito(i)}
                    {i.miembro_id != null && (presentesMes.get(i.miembro_id) ?? 0) > i.plan_frecuencia * 4 && (
                      <Badge variant="warning">Sobre-asistencia · {presentesMes.get(i.miembro_id)} este mes</Badge>
                    )}
                  </span>
                  <span className="text-muted-foreground">
                    {i.dias && i.dias.length > 0 && (
                      <>{[...i.dias].sort((a, b) => a - b).map((d) => DIA_LABEL[d]).join(" · ")} · </>
                    )}
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
              <InscribirForm academiaId={academiaId} />
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
