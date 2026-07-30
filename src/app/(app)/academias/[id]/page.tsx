import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { rolesForModule, can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { mapaNombresStaff, profesoresActivos } from "@/lib/staff";
import { rangoPeriodo, parsePeriodo } from "@/lib/periodo";
import { PeriodoToggle } from "../../dashboard/periodo-toggle";
import { InscribirForm } from "./inscribir-form";
import { ListaEsperaForm } from "./lista-espera-form";
import { EliminarAcademiaButton } from "./eliminar-academia-button";
import { InscritoRow, type Inscrito } from "./inscrito-row";
import { RendimientoFranjas, type Franja } from "./rendimiento-franjas";
import { RendimientoNinos, type NinoRendimiento } from "./rendimiento-ninos";
import { ClasesDictadas, type ClaseDictada } from "./clases-dictadas";

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

export default async function AcademiaDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ periodo?: string; desde?: string; hasta?: string }>;
}) {
  const profile = await requireRole(rolesForModule("academias"));
  const { id } = await params;
  const academiaId = Number(id);
  const sp = await searchParams;
  // Mismo filtro de periodo que el dashboard y los ingresos: sin él, "clases
  // dictadas" se acumula desde el principio de los tiempos y los % no dicen nada.
  const periodo = parsePeriodo(sp.periodo);
  const { curStartIso, curEndIso } = rangoPeriodo(periodo, new Date(), sp.desde, sp.hasta);
  const supabase = await createClient();

  const { data: a } = await supabase.from("academias").select("*").eq("id", academiaId).single();
  if (!a) notFound();

  // Servicio de Siigo con el que se factura: es el puente con la plata.
  const { data: servicio } = a.servicio_id
    ? await supabase.from("servicios").select("nombre, siigo_grupo").eq("id", a.servicio_id).maybeSingle()
    : { data: null };

  const { data: inscripciones } = await supabase
    .from("inscripciones")
    .select("id, cliente_id, miembro_id, nivel, descuento_pct")
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

  // Horarios de cada inscrito + el nombre del profesor de cada uno.
  const insIds = (inscripciones ?? []).map((i) => i.id);
  const { data: horarios } = insIds.length
    ? await supabase
        .from("inscripcion_horarios")
        .select("id, inscripcion_id, dia_semana, hora_inicio, hora_fin, profesor_id, cancha")
        .in("inscripcion_id", insIds)
        .order("dia_semana")
        .order("hora_inicio")
    : { data: [] };
  // Sin condicionar: lo necesitan los horarios Y las clases dictadas del rendimiento.
  const nombresStaff = await mapaNombresStaff();

  const profesores = (await profesoresActivos()).map((p) => ({ id: p.id, nombre: p.nombre }));

  const inscritos: Inscrito[] = (inscripciones ?? [])
    .map((i) => ({
      inscripcionId: i.id,
      nombre: nombreInscrito(i),
      nivel: i.nivel,
      descuento: Number(i.descuento_pct),
      presentesMes: i.miembro_id != null ? presentesMes.get(i.miembro_id) ?? 0 : 0,
      horarios: (horarios ?? [])
        .filter((h) => h.inscripcion_id === i.id)
        .map((h) => ({
          id: h.id,
          dia_semana: h.dia_semana,
          hora_inicio: h.hora_inicio,
          hora_fin: h.hora_fin,
          profesorNombre: h.profesor_id ? nombresStaff.get(h.profesor_id) ?? null : null,
          cancha: h.cancha,
        })),
    }))
    .sort((x, y) => x.nombre.localeCompare(y.nombre, "es"));

  // ───────── Rendimiento del periodo (agregado en SQL, ver migración 0057) ─────────
  const [{ data: franjasRaw }, { data: clasesRaw }, { data: ninosRaw }] = await Promise.all([
    supabase.rpc("academia_rendimiento_franja", { p_academia: academiaId, p_desde: curStartIso, p_hasta: curEndIso }),
    supabase.rpc("academia_clases_periodo", { p_academia: academiaId, p_desde: curStartIso, p_hasta: curEndIso }),
    supabase.rpc("academia_rendimiento_nino", { p_academia: academiaId, p_desde: curStartIso, p_hasta: curEndIso }),
  ]);
  const franjas = (franjasRaw ?? []) as Franja[];
  const ninos = (ninosRaw ?? []) as NinoRendimiento[];
  const clasesDictadas: ClaseDictada[] = ((clasesRaw ?? []) as (Omit<ClaseDictada, "profesorNombre"> & { profesor_id: string | null })[]).map((c) => ({
    ...c,
    profesorNombre: c.profesor_id ? nombresStaff.get(c.profesor_id) ?? null : null,
  }));

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
        {/* La academia es un SERVICIO: no tiene un horario ni un profesor, porque cada
            inscrito tiene los suyos. Lo que describe es el servicio y su tamaño. */}
        <CardContent className="grid grid-cols-2 gap-4 text-sm">
          <Dato label="Categoría" valor={a.categoria === "competencia" ? "Competencia" : a.categoria === "recreativa" ? "Recreativa" : null} />
          <Dato label="Inscritos" valor={`${inscripciones?.length ?? 0} ${(inscripciones?.length ?? 0) === 1 ? "niño" : "niños"}`} />
          <Dato label="Servicio en Siigo" valor={servicio?.nombre ?? null} />
          <Dato label="Grupo de producto" valor={servicio?.siigo_grupo ?? null} />
          <Dato label="Precio de referencia" valor={COP.format(a.precio)} />
          <Dato label="Matrícula de referencia" valor={COP.format(a.matricula)} />
        </CardContent>
        <CardContent className="pt-0">
          <p className="text-muted-foreground text-xs">
            El ingreso de la academia sale de las facturas de Siigo del servicio de arriba. Los
            valores de referencia son solo para consulta, no se usan para calcular.
          </p>
        </CardContent>
      </Card>

      {/* Rendimiento: el filtro de periodo va AQUÍ y no en la lista general de
          academias, porque la academia ya es el filtro (se llegó haciéndole clic) y
          porque mezclar las 4 en una tabla invita a comparar cifras que no son
          comparables: un grupo de competencia con 3 niños al 94% está sano, uno de
          recreativa con 3 se está muriendo. */}
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>Rendimiento por franja</CardTitle>
          <PeriodoToggle
            periodo={periodo}
            desde={sp.desde}
            hasta={sp.hasta}
            basePath={`/academias/${academiaId}`}
          />
        </CardHeader>
        <CardContent>
          <RendimientoFranjas franjas={franjas} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rendimiento por niño</CardTitle>
        </CardHeader>
        <CardContent>
          <RendimientoNinos ninos={ninos} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Clases del periodo ({clasesDictadas.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-2 text-xs">
            Haz clic en una clase para ver quién asistió.
          </p>
          <ClasesDictadas clases={clasesDictadas} />
        </CardContent>
      </Card>

      <Card className="overflow-visible">
        <CardHeader>
          <CardTitle>Inscritos ({inscritos.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {inscritos.length > 0 ? (
            <ul className="divide-y">
              {inscritos.map((i) => (
                <InscritoRow
                  key={i.inscripcionId}
                  academiaId={academiaId}
                  inscrito={i}
                  profesores={profesores}
                  puedeEditar={puedeInscribir}
                />
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">Sin inscritos.</p>
          )}
          {puedeInscribir && (
            <div className="border-t pt-4">
              <InscribirForm academiaId={academiaId} profesores={profesores} />
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
