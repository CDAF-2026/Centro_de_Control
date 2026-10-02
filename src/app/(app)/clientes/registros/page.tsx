import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PUEDE_REVISAR_REGISTROS } from "@/lib/registro/revision";
import { fechaHoraCorta } from "@/lib/fecha";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Inbox } from "lucide-react";
import { DecidirCambio, AsignarFirma, RevisarSolicitud } from "./formularios";

const CAMPO: Record<string, string> = {
  factura_a_nit: "NIT de facturación",
  factura_a_nombre: "A nombre de quién se factura",
  factura_tipo: "Tipo (natural / jurídica)",
  factura_email: "Correo de facturación",
};
const ESTADO: Record<string, string> = { recibida: "Recibida", aplicada: "Aplicada", en_revision: "En revisión", rechazada: "Descartada", expirada: "Expirada" };

type Payload = { menor?: { nombres?: string; apellidos?: string; documento?: string }; firmante?: { nombre?: string }; acudientes?: { nombre?: string; principal?: boolean }[]; busqueda?: { candidatos?: number[] } };

/**
 * Bandeja del registro por QR (plan §4.10). Pequeña a propósito (D1 y D3):
 * cambios de facturación por aprobar, y —solo si existen— firmas o solicitudes
 * sin dueño claro. Revisan SA y coord. administrativo (`PUEDE_REVISAR_REGISTROS`).
 */
export default async function RegistrosPage() {
  await requireRole(PUEDE_REVISAR_REGISTROS);
  const supabase = await createClient();

  const [{ data: cambios }, { data: firmas }, { data: ambiguas }, { data: historial }] = await Promise.all([
    supabase.from("registro_cambio").select("id, cliente_id, campo, valor_actual, valor_nuevo, created_at").eq("estado", "pendiente").order("created_at"),
    supabase.from("consentimiento_firma").select("id, firmante_nombre, menor_nombre, menor_documento, firmado_el").eq("estado", "pendiente_asignar").order("firmado_el"),
    supabase.from("registro_solicitud").select("id, payload, created_at").eq("estado", "en_revision").eq("tipo", "datos").is("cliente_id", null).order("created_at"),
    supabase.from("registro_solicitud").select("id, tipo, estado, cliente_id, created_at, resultado, nota_revision").order("created_at", { ascending: false }).limit(100),
  ]);

  const clienteIds = Array.from(new Set([...(cambios ?? []).map((c) => c.cliente_id), ...(historial ?? []).map((h) => h.cliente_id).filter((x): x is number => x != null)]));
  const { data: clientes } = clienteIds.length
    ? await supabase.from("clientes").select("id, nombres, apellidos").in("id", clienteIds)
    : { data: [] as { id: number; nombres: string; apellidos: string }[] };
  const nombre = new Map((clientes ?? []).map((c) => [c.id, `${c.nombres} ${c.apellidos}`]));

  // Candidatos de las ambiguas, para mostrarlos con nombre.
  const candIds = Array.from(new Set((ambiguas ?? []).flatMap((a) => ((a.payload as Payload)?.busqueda?.candidatos ?? []))));
  const { data: cands } = candIds.length
    ? await supabase.from("cliente_miembros").select("id, cliente_id, nombres, apellidos, documento").in("id", candIds)
    : { data: [] as { id: number; cliente_id: number; nombres: string; apellidos: string; documento: string | null }[] };
  const cand = new Map((cands ?? []).map((c) => [c.id, c]));

  const porFicha = new Map<number, NonNullable<typeof cambios>>();
  for (const c of cambios ?? []) porFicha.set(c.cliente_id, [...(porFicha.get(c.cliente_id) ?? []), c]);
  const nada = !cambios?.length && !firmas?.length && !ambiguas?.length;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/clientes" className="text-muted-foreground text-sm hover:underline">← Clientes</Link>
        <h1 className="cdaf-headline mt-1">Registros por revisar</h1>
        <p className="text-muted-foreground text-sm">Lo que llegó desde el registro por QR y necesita una decisión. Todo lo demás se aplicó solo.</p>
      </div>

      {nada && <EmptyState icon={Inbox} title="Nada por revisar" description="Los registros de los papás se están aplicando solos a las fichas." />}

      {porFicha.size > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Facturación por aprobar</CardTitle>
            <CardDescription>La ficha ya tenía un NIT y la familia propuso otro, o el NIT propuesto ya es de otra ficha. Nada de esto se aplica hasta que lo apruebes.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {Array.from(porFicha.entries()).map(([clienteId, lista]) => (
              <div key={clienteId} className="space-y-3 rounded-lg border p-4">
                <Link href={`/clientes/${clienteId}`} className="font-medium hover:underline">{nombre.get(clienteId) ?? `Ficha ${clienteId}`}</Link>
                <div className="cdaf-table-wrap">
                  <table className="cdaf-table">
                    <thead><tr><th>Campo</th><th>Hoy</th><th>Propuesto</th><th>Decisión</th></tr></thead>
                    <tbody>
                      {lista.map((c) => (
                        <tr key={c.id}>
                          <td>{CAMPO[c.campo] ?? c.campo}</td>
                          <td className="text-muted-foreground">{c.valor_actual ?? "—"}</td>
                          <td className="font-medium">{c.valor_nuevo ?? "—"}</td>
                          <td><DecidirCambio cambioId={c.id} esNit={c.campo === "factura_a_nit"} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {(firmas?.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Firmas por asignar</CardTitle>
            <CardDescription>El documento y el nombre coinciden con más de una ficha (fichas duplicadas). Escoge a cuál deportista pertenece la firma; el PDF entra a su ficha.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {firmas!.map((f) => (
              <div key={f.id} className="space-y-2 rounded-lg border p-4">
                <p className="text-sm"><span className="font-medium">{f.menor_nombre}</span> {f.menor_documento ? `· ${f.menor_documento}` : ""} · firmado por {f.firmante_nombre} el {fechaHoraCorta(f.firmado_el)}</p>
                <AsignarFirma firmaId={f.id} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {(ambiguas?.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Datos por asignar</CardTitle>
            <CardDescription>Un formulario de datos coincidió con más de una ficha y no se aplicó. Escoge a cuál deportista pertenece, o descártalo.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {ambiguas!.map((a) => {
              const p = (a.payload as Payload) ?? {};
              const quien = p.acudientes?.find((x) => x.principal)?.nombre ?? p.firmante?.nombre ?? "—";
              return (
                <div key={a.id} className="space-y-2 rounded-lg border p-4">
                  <p className="text-sm"><span className="font-medium">{p.menor?.nombres} {p.menor?.apellidos}</span> {p.menor?.documento ? `· ${p.menor.documento}` : ""} · enviado por {quien} el {fechaHoraCorta(a.created_at)}</p>
                  <p className="text-muted-foreground text-xs">
                    Coincide con: {(p.busqueda?.candidatos ?? []).map((id) => { const c = cand.get(id); return c ? `${c.nombres} ${c.apellidos} (ficha ${c.cliente_id})` : `miembro ${id}`; }).join(" · ") || "—"}
                  </p>
                  <RevisarSolicitud solicitudId={a.id} />
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Historial</CardTitle>
          <CardDescription>Las últimas 100 solicitudes que llegaron por el QR.</CardDescription>
        </CardHeader>
        <CardContent>
          {historial?.length ? (
            <div className="cdaf-table-wrap">
              <table className="cdaf-table">
                <thead><tr><th>Cuándo</th><th>Qué</th><th>Ficha</th><th>Estado</th></tr></thead>
                <tbody>
                  {historial.map((h) => {
                    const r = (h.resultado ?? {}) as { creada?: boolean; cambios_pendientes?: number };
                    return (
                      <tr key={h.id}>
                        <td className="whitespace-nowrap">{fechaHoraCorta(h.created_at)}</td>
                        <td>{h.tipo === "datos" ? "Datos" : "Consentimiento"}{r.creada ? " · ficha nueva" : ""}{r.cambios_pendientes ? ` · ${r.cambios_pendientes} de facturación` : ""}</td>
                        <td>{h.cliente_id ? <Link href={`/clientes/${h.cliente_id}`} className="hover:underline">{nombre.get(h.cliente_id) ?? `Ficha ${h.cliente_id}`}</Link> : "—"}</td>
                        <td><Badge variant={h.estado === "aplicada" ? "success" : h.estado === "en_revision" ? "warning" : "outline"}>{ESTADO[h.estado] ?? h.estado}</Badge>{h.nota_revision ? <span className="text-muted-foreground ml-2 text-xs">{h.nota_revision}</span> : null}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">Todavía no ha llegado ninguna solicitud.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
