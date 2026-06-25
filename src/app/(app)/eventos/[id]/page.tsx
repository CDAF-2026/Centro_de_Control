import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { rolesForModule, can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ParticipanteForm } from "./participante-form";
import { ProfesorForm } from "./profesor-form";
import { RemoveButton } from "./remove-button";
import { quitarParticipante, quitarProfesor } from "../actions";

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const TIPO_LABEL: Record<string, string> = { torneo: "Torneo", clinica: "Clínica", masterclass: "Masterclass", otro: "Otro" };
const ESTADO_LABEL: Record<string, string> = { planeado: "Planeado", en_curso: "En curso", finalizado: "Finalizado", cancelado: "Cancelado" };

export default async function EventoDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireRole(rolesForModule("eventos"));
  const { id } = await params;
  const eventoId = Number(id);
  const puedeEditar = can(profile.role, "eventos", "edit");
  const supabase = await createClient();

  const { data: evento } = await supabase.from("eventos").select("*").eq("id", eventoId).single();
  if (!evento) notFound();

  const [partsRes, profesRes, servicioRes, profesoresRes, facsEvRes] = await Promise.all([
    supabase
      .from("evento_participantes")
      .select("id, cliente_id, nombre_externo, telefono_externo, monto, estado")
      .eq("evento_id", eventoId)
      .order("created_at"),
    supabase.from("evento_profesores").select("id, profesor_id, rol, pago").eq("evento_id", eventoId).order("created_at"),
    evento.servicio_id
      ? supabase.from("servicios").select("nombre").eq("id", evento.servicio_id).single()
      : Promise.resolve({ data: null as { nombre: string } | null }),
    supabase.from("profiles").select("id, nombre").eq("role", "profesor").order("nombre"),
    supabase.from("siigo_facturas").select("total, saldo").eq("evento_id", eventoId),
  ]);

  const parts = partsRes.data ?? [];
  const profes = profesRes.data ?? [];
  const profesores = profesoresRes.data ?? [];

  const cliIds = parts.map((p) => p.cliente_id).filter((x): x is number => x != null);
  const { data: clientes } = cliIds.length
    ? await supabase.from("clientes").select("id, nombres, apellidos").in("id", cliIds)
    : { data: [] as { id: number; nombres: string; apellidos: string | null }[] };
  const cliNombre = new Map((clientes ?? []).map((c) => [c.id, `${c.nombres} ${c.apellidos ?? ""}`.trim()]));
  const profNombre = new Map(profesores.map((p) => [p.id, p.nombre ?? p.id]));

  const recaudadoSiigo = (facsEvRes.data ?? []).reduce((s, f) => s + ((f.total ?? 0) - (f.saldo ?? 0)), 0);
  const totalProfes = profes.reduce((s, p) => s + (p.pago ?? 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/eventos" className="text-muted-foreground text-sm hover:underline">
          ← Eventos
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="cdaf-headline">{evento.nombre}</h1>
          <Badge variant="secondary">{TIPO_LABEL[evento.tipo] ?? evento.tipo}</Badge>
          <Badge variant="outline">{ESTADO_LABEL[evento.estado] ?? evento.estado}</Badge>
        </div>
        <p className="text-muted-foreground mt-1 text-sm">
          {evento.fecha_inicio}
          {evento.fecha_fin ? ` → ${evento.fecha_fin}` : ""}
          {evento.hora_inicio ? ` · ${evento.hora_inicio}` : ""}
          {evento.deporte ? ` · ${evento.deporte}` : ""}
          {evento.lugar ? ` · ${evento.lugar}` : ""}
          {servicioRes.data ? ` · Servicio: ${servicioRes.data.nombre}` : " · Sin servicio asignado"}
        </p>
        {evento.notas && <p className="mt-1 text-sm">{evento.notas}</p>}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Recaudado (Siigo)</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-semibold">{COP.format(recaudadoSiigo)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">A pagar a profesores</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-semibold">{COP.format(totalProfes)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Participantes</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">
              {parts.length}
              {evento.cupo ? <span className="text-muted-foreground text-sm"> / {evento.cupo}</span> : null}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Participantes */}
      <Card>
        <CardHeader><CardTitle>Participantes</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {parts.length > 0 ? (
            <ul className="divide-y text-sm">
              {parts.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    {p.cliente_id ? cliNombre.get(p.cliente_id) ?? `Cliente #${p.cliente_id}` : p.nombre_externo}
                    {!p.cliente_id && <Badge variant="outline" className="ml-2">Externo</Badge>}
                    {p.telefono_externo && <span className="text-muted-foreground"> · {p.telefono_externo}</span>}
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="text-muted-foreground tabular-nums">{COP.format(p.monto ?? 0)}</span>
                    {p.monto > 0 && <Badge variant="secondary">pagado</Badge>}
                    {puedeEditar && <RemoveButton action={quitarParticipante} id={p.id} eventoId={eventoId} />}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">Aún no hay participantes.</p>
          )}
          {puedeEditar && (
            <div className="border-t pt-3">
              <ParticipanteForm eventoId={eventoId} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Profesores */}
      <Card>
        <CardHeader><CardTitle>Profesores</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {profes.length > 0 ? (
            <ul className="divide-y text-sm">
              {profes.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    {profNombre.get(p.profesor_id) ?? p.profesor_id}
                    {p.rol && <span className="text-muted-foreground"> · {p.rol}</span>}
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="text-muted-foreground tabular-nums">{COP.format(p.pago ?? 0)}</span>
                    {puedeEditar && <RemoveButton action={quitarProfesor} id={p.id} eventoId={eventoId} />}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">Sin profesores asignados.</p>
          )}
          {puedeEditar && (
            <div className="border-t pt-3">
              <ProfesorForm eventoId={eventoId} profesores={profesores} />
              <p className="text-muted-foreground mt-2 text-xs">
                El pago de cada profesor se suma a su Liquidación del periodo, etiquetado como “Evento”.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
