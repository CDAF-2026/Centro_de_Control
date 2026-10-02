import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PUEDE_REVISAR_REGISTROS } from "@/lib/registro/revision";
import { soloDigitos } from "@/lib/registro/match";
import { edadDesde } from "@/lib/validations/cliente";
import { fechaHoraCorta } from "@/lib/fecha";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { ArrowRight, ClipboardList, Inbox, PenLine, Receipt } from "lucide-react";
import { DecidirCambios, AsignarFirma, RevisarSolicitud, type CandidatoFicha } from "./formularios";

const CAMPO: Record<string, string> = {
  factura_a_nit: "NIT de facturación",
  factura_a_nombre: "A nombre de quién se factura",
  factura_tipo: "Tipo",
  factura_email: "Correo de facturación",
};
const TIPO_FACTURA: Record<string, string> = { natural: "Persona natural", juridica: "Empresa" };
const ESTADO: Record<string, string> = { recibida: "Recibida", aplicada: "Aplicada", en_revision: "En revisión", rechazada: "Descartada", expirada: "Expirada" };
const FILTROS = [
  { clave: "", etiqueta: "Todo" },
  { clave: "datos", etiqueta: "Datos" },
  { clave: "consentimiento", etiqueta: "Consentimientos" },
  { clave: "revision", etiqueta: "Con revisión" },
] as const;

type Payload = {
  menor?: { nombres?: string; apellidos?: string; documento?: string; fecha_nacimiento?: string };
  firmante?: { nombre?: string };
  acudientes?: { nombre?: string; rol?: string; principal?: boolean }[];
  busqueda?: { candidatos?: number[] };
};
type Miembro = { id: number; cliente_id: number; nombres: string; apellidos: string; documento: string | null; fecha_nacimiento: string | null; es_titular: boolean };

const ROL: Record<string, string> = { madre: "madre", padre: "padre", otro: "acudiente" };
const quienEnvio = (p: Payload) => {
  const a = p.acudientes?.find((x) => x.principal) ?? p.acudientes?.[0];
  if (a?.nombre) return `${a.nombre}${a.rol && ROL[a.rol] ? ` (${ROL[a.rol]})` : ""}`;
  return p.firmante?.nombre ?? "—";
};

/**
 * Bandeja del registro por QR (plan §4.10), diseño "A · Cola única" (Laura, 2-oct-2026):
 * tres contadores, UNA cola de pendientes ordenada por antigüedad con la decisión en la
 * misma tarjeta, y el historial con filtros. Pequeña a propósito (D1 y D3). Revisan SA y
 * coord. administrativo (`PUEDE_REVISAR_REGISTROS`).
 */
export default async function RegistrosPage({ searchParams }: { searchParams: Promise<{ filtro?: string }> }) {
  await requireRole(PUEDE_REVISAR_REGISTROS);
  const { filtro = "" } = await searchParams;
  const supabase = await createClient();

  let historialQ = supabase.from("registro_solicitud").select("id, tipo, estado, cliente_id, created_at, resultado, nota_revision, payload").order("created_at", { ascending: false }).limit(100);
  if (filtro === "datos" || filtro === "consentimiento") historialQ = historialQ.eq("tipo", filtro);
  if (filtro === "revision") historialQ = historialQ.in("estado", ["en_revision", "rechazada"]);

  const [{ data: cambios }, { data: firmas }, { data: ambiguas }, { data: historial }, { count: nTodo }, { count: nDatos }, { count: nCons }, { count: nRev }] = await Promise.all([
    supabase.from("registro_cambio").select("id, cliente_id, solicitud_id, campo, valor_actual, valor_nuevo, created_at").eq("estado", "pendiente").order("created_at"),
    supabase.from("consentimiento_firma").select("id, firmante_nombre, firmante_parentesco, menor_nombre, menor_documento, firmado_el").eq("estado", "pendiente_asignar").order("firmado_el"),
    supabase.from("registro_solicitud").select("id, payload, created_at").eq("estado", "en_revision").eq("tipo", "datos").is("cliente_id", null).order("created_at"),
    historialQ,
    supabase.from("registro_solicitud").select("id", { count: "exact", head: true }),
    supabase.from("registro_solicitud").select("id", { count: "exact", head: true }).eq("tipo", "datos"),
    supabase.from("registro_solicitud").select("id", { count: "exact", head: true }).eq("tipo", "consentimiento"),
    supabase.from("registro_solicitud").select("id", { count: "exact", head: true }).in("estado", ["en_revision", "rechazada"]),
  ]);
  const conteos: Record<string, number> = { "": nTodo ?? 0, datos: nDatos ?? 0, consentimiento: nCons ?? 0, revision: nRev ?? 0 };

  // Nombres de las fichas (cambios + historial) y quién propuso cada cambio (su solicitud).
  const clienteIds = Array.from(new Set([...(cambios ?? []).map((c) => c.cliente_id), ...(historial ?? []).map((h) => h.cliente_id).filter((x): x is number => x != null)]));
  const solIds = Array.from(new Set((cambios ?? []).map((c) => c.solicitud_id)));
  const [{ data: clientes }, { data: sols }] = await Promise.all([
    clienteIds.length ? supabase.from("clientes").select("id, nombres, apellidos").in("id", clienteIds) : Promise.resolve({ data: [] as { id: number; nombres: string; apellidos: string }[] }),
    solIds.length ? supabase.from("registro_solicitud").select("id, payload").in("id", solIds) : Promise.resolve({ data: [] as { id: string; payload: unknown }[] }),
  ]);
  const nombre = new Map((clientes ?? []).map((c) => [c.id, `${c.nombres} ${c.apellidos}`]));
  const propuso = new Map((sols ?? []).map((s) => [s.id, quienEnvio((s.payload as Payload) ?? {})]));

  // Candidatos: de las solicitudes ambiguas (vienen en el payload) y de las firmas (todos
  // los miembros con ese documento: la firma no guarda la lista).
  const candIds = Array.from(new Set((ambiguas ?? []).flatMap((a) => ((a.payload as Payload)?.busqueda?.candidatos ?? []))));
  const docsFirma = Array.from(new Set((firmas ?? []).map((f) => soloDigitos(f.menor_documento)).filter((d): d is string => !!d)));
  const [{ data: candsPorId }, { data: candsPorDoc }] = await Promise.all([
    candIds.length ? supabase.from("cliente_miembros").select("id, cliente_id, nombres, apellidos, documento, fecha_nacimiento, es_titular").in("id", candIds) : Promise.resolve({ data: [] as Miembro[] }),
    docsFirma.length ? supabase.from("cliente_miembros").select("id, cliente_id, nombres, apellidos, documento, fecha_nacimiento, es_titular").in("documento", docsFirma).eq("activo", true) : Promise.resolve({ data: [] as Miembro[] }),
  ]);
  const aCandidato = (m: Miembro): CandidatoFicha => {
    const edad = edadDesde(m.fecha_nacimiento);
    return { miembro_id: m.id, cliente_id: m.cliente_id, nombre: `${m.nombres} ${m.apellidos}`, detalle: [m.es_titular ? "Titular de la ficha" : "Miembro de la ficha", edad != null ? `${edad} años` : null, m.documento ? `doc. ${m.documento}` : "sin documento"].filter(Boolean).join(" · ") };
  };
  const candPorId = new Map((candsPorId ?? []).map((m) => [m.id, aCandidato(m)]));
  const candPorDoc = new Map<string, CandidatoFicha[]>();
  for (const m of candsPorDoc ?? []) candPorDoc.set(m.documento!, [...(candPorDoc.get(m.documento!) ?? []), aCandidato(m)]);

  // Una sola cola, lo más antiguo primero.
  const porFicha = new Map<number, NonNullable<typeof cambios>>();
  for (const c of cambios ?? []) porFicha.set(c.cliente_id, [...(porFicha.get(c.cliente_id) ?? []), c]);
  type Item = { cuando: string; nodo: React.ReactNode };
  const cola: Item[] = [
    ...Array.from(porFicha.entries()).map(([clienteId, lista]) => ({
      cuando: lista[0].created_at,
      nodo: (
        <Pendiente key={`c${clienteId}`} tipo="Facturación" destacado titulo={nombre.get(clienteId) ?? `Ficha ${clienteId}`} href={`/clientes/${clienteId}`} meta={`propuesto por ${propuso.get(lista[0].solicitud_id) ?? "la familia"} · ${fechaHoraCorta(lista[0].created_at)}`}>
          <div className={cn("grid gap-3", lista.length > 1 && "md:grid-cols-2")}>
            {lista.map((c) => (
              <div key={c.id} className="rounded-xl border p-3">
                <p className="cdaf-eyebrow text-muted-foreground text-[11px]">{CAMPO[c.campo] ?? c.campo}</p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted-foreground line-through">{mostrar(c.campo, c.valor_actual)}</span>
                  <ArrowRight className="text-muted-foreground size-4 shrink-0" />
                  <span className="font-semibold">{mostrar(c.campo, c.valor_nuevo)}</span>
                </p>
              </div>
            ))}
          </div>
          <DecidirCambios ids={lista.map((c) => c.id)} esNit={lista.some((c) => c.campo === "factura_a_nit")} />
        </Pendiente>
      ),
    })),
    ...(firmas ?? []).map((f) => ({
      cuando: f.firmado_el,
      nodo: (
        <Pendiente key={f.id} tipo="Firma" titulo={f.menor_nombre} meta={`${f.menor_documento ? `doc. ${f.menor_documento} · ` : ""}firmó ${f.firmante_nombre}${f.firmante_parentesco ? ` (${f.firmante_parentesco.toLowerCase()})` : ""} · ${fechaHoraCorta(f.firmado_el)}`}>
          <p className="text-muted-foreground text-sm">Más de una ficha tiene este documento y este nombre. ¿A cuál pertenece la firma? El PDF entra a esa ficha.</p>
          <AsignarFirma firmaId={f.id} candidatos={candPorDoc.get(soloDigitos(f.menor_documento) ?? "") ?? []} />
        </Pendiente>
      ),
    })),
    ...(ambiguas ?? []).map((a) => {
      const p = (a.payload as Payload) ?? {};
      return {
        cuando: a.created_at,
        nodo: (
          <Pendiente key={a.id} tipo="Datos" titulo={`${p.menor?.nombres ?? ""} ${p.menor?.apellidos ?? ""}`.trim() || "—"} meta={`${p.menor?.documento ? `doc. ${p.menor.documento} · ` : ""}envió ${quienEnvio(p)} · ${fechaHoraCorta(a.created_at)}`}>
            <p className="text-muted-foreground text-sm">El formulario coincide con más de una ficha y no se aplicó. Escoge la ficha o descártalo.</p>
            <RevisarSolicitud solicitudId={a.id} candidatos={(p.busqueda?.candidatos ?? []).map((id) => candPorId.get(id)).filter((c): c is CandidatoFicha => !!c)} />
          </Pendiente>
        ),
      };
    }),
  ].sort((x, y) => x.cuando.localeCompare(y.cuando));

  const nFact = porFicha.size;
  const nFirmas = firmas?.length ?? 0;
  const nDatosPend = ambiguas?.length ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/clientes" className="text-muted-foreground text-sm hover:underline">← Clientes</Link>
        <h1 className="cdaf-headline mt-1">Registros por revisar</h1>
      </div>

      {cola.length === 0 ? (
        <EmptyState icon={Inbox} title="Nada por revisar" description="Los registros que llegan por el QR se están aplicando solos a las fichas." />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Contador n={nFact} etiqueta={nFact === 1 ? "Facturación por aprobar" : "Facturaciones por aprobar"} icono={Receipt} destacado />
            <Contador n={nFirmas} etiqueta={nFirmas === 1 ? "Firma por asignar" : "Firmas por asignar"} icono={PenLine} />
            <Contador n={nDatosPend} etiqueta="Datos por asignar" icono={ClipboardList} />
          </div>

          <section className="space-y-3">
            <div className="flex items-baseline justify-between px-1">
              <h2 className="cdaf-eyebrow text-muted-foreground text-xs">Pendientes · {cola.length}</h2>
              <span className="text-muted-foreground text-xs">Lo más antiguo primero</span>
            </div>
            {cola.map((i) => i.nodo)}
          </section>
        </>
      )}

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>Historial</CardTitle>
          <div className="flex flex-wrap gap-1.5">
            {FILTROS.map((f) => (
              <Link
                key={f.clave}
                href={f.clave ? `/clientes/registros?filtro=${f.clave}` : "/clientes/registros"}
                className={cn("inline-flex h-8 items-center rounded-full px-3 text-xs font-semibold transition-colors", filtro === f.clave ? "bg-stadium text-white" : "border-border bg-card text-foreground hover:bg-muted border")}
              >
                {f.etiqueta} · {conteos[f.clave]}
              </Link>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {historial?.length ? (
            <div className="cdaf-table-wrap">
              <table className="cdaf-table">
                <thead><tr><th>Cuándo</th><th>Qué</th><th>Deportista</th><th>Quién</th><th>Resultado</th></tr></thead>
                <tbody>
                  {historial.map((h) => {
                    const r = (h.resultado ?? {}) as { creada?: boolean; cambios_pendientes?: number };
                    const p = (h.payload as Payload) ?? {};
                    const deportista = h.cliente_id ? (nombre.get(h.cliente_id) ?? `Ficha ${h.cliente_id}`) : `${p.menor?.nombres ?? ""} ${p.menor?.apellidos ?? ""}`.trim() || "—";
                    return (
                      <tr key={h.id}>
                        <td className="text-muted-foreground whitespace-nowrap">{fechaHoraCorta(h.created_at)}</td>
                        <td className="whitespace-nowrap">{h.tipo === "datos" ? "Datos" : "Consentimiento"}</td>
                        <td>{h.cliente_id ? <Link href={`/clientes/${h.cliente_id}`} className="font-semibold hover:underline">{deportista}</Link> : deportista}</td>
                        <td className="text-muted-foreground">{quienEnvio(p)}</td>
                        <td className="space-x-1.5">
                          <Badge variant={h.estado === "aplicada" ? "success" : h.estado === "en_revision" ? "warning" : "outline"}>
                            {h.estado === "aplicada" ? (h.tipo === "consentimiento" ? "Firmado · PDF en la ficha" : r.creada ? "Ficha nueva" : "Ficha actualizada") : (ESTADO[h.estado] ?? h.estado)}
                          </Badge>
                          {r.cambios_pendientes ? <Badge variant="warning">{r.cambios_pendientes} de facturación por aprobar</Badge> : null}
                          {h.nota_revision ? <span className="text-muted-foreground text-xs">“{h.nota_revision}”</span> : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">{filtro ? "Nada con este filtro." : "Todavía no ha llegado ninguna solicitud."}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function mostrar(campo: string, valor: string | null): string {
  if (valor == null || valor === "") return "—";
  if (campo === "factura_tipo") return TIPO_FACTURA[valor] ?? valor;
  return valor;
}

function Contador({ n, etiqueta, icono: Icono, destacado }: { n: number; etiqueta: string; icono: React.ComponentType<{ className?: string }>; destacado?: boolean }) {
  return (
    <div className={cn("flex items-center gap-3.5 rounded-2xl p-4 shadow-sm", destacado ? "bg-stadium text-white" : "bg-card")}>
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", destacado ? "bg-primary/20 text-primary" : "bg-muted text-foreground")}><Icono className="size-5" /></span>
      <span className="flex flex-col">
        <span className={cn("font-heading text-2xl leading-none font-bold tabular-nums", destacado && n > 0 && "text-primary")}>{n}</span>
        <span className={cn("mt-1 text-xs", destacado ? "text-[#c5cdc9]" : "text-muted-foreground")}>{etiqueta}</span>
      </span>
    </div>
  );
}

function Pendiente({ tipo, destacado, titulo, href, meta, children }: { tipo: string; destacado?: boolean; titulo: string; href?: string; meta: string; children: React.ReactNode }) {
  return (
    <article className="bg-card space-y-3.5 rounded-2xl p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Badge variant={destacado ? "success" : "outline"} className={cn("uppercase tracking-wider", destacado && "bg-primary text-stadium")}>{tipo}</Badge>
        {href ? <Link href={href} className="font-heading font-semibold hover:underline">{titulo}</Link> : <span className="font-heading font-semibold">{titulo}</span>}
        <span className="text-muted-foreground text-sm">· {meta}</span>
      </div>
      {children}
    </article>
  );
}
