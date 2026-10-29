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
import { buttonVariants } from "@/components/ui/button";
import { ArrowRight, CameraOff, ClipboardList, Inbox, PenLine, Receipt } from "lucide-react";
import { DecidirCambios, AsignarFirma, RevisarSolicitud, type CandidatoFicha } from "./formularios";

const CAMPO: Record<string, string> = {
  factura_a_nit: "NIT de facturación",
  factura_a_nombre: "A nombre de quién se factura",
  factura_tipo: "Tipo",
  factura_email: "Correo de facturación",
};
const TIPO_FACTURA: Record<string, string> = { natural: "Persona natural", juridica: "Empresa" };
const ESTADO: Record<string, string> = { recibida: "Recibida", aplicada: "Aplicada", en_revision: "En revisión", rechazada: "Descartada", expirada: "Expirada" };
// El historial junta en UNA fila los datos y la firma de la misma persona en la misma visita
// (opción A, Laura, 28-oct-2026), así que ya no se filtra por tipo.
const FILTROS = [
  { clave: "", etiqueta: "Todo" },
  { clave: "revision", etiqueta: "Con revisión" },
] as const;
const LIMITE_HISTORIAL = 200;

type Payload = {
  menor?: { nombres?: string; apellidos?: string; documento?: string; fecha_nacimiento?: string };
  firmante?: { nombre?: string; parentesco?: string | null };
  acudientes?: { nombre?: string; rol?: string; parentesco?: string | null; principal?: boolean }[];
  busqueda?: { tipo?: string; candidatos?: number[] };
  autoriza?: { imagen?: boolean };
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

  const COLUMNAS_HISTORIAL = "id, tipo, estado, cliente_id, miembro_id, sesion_id, created_at, resultado, nota_revision, payload";
  const EN_REVISION = ["en_revision", "rechazada"] as const;
  let historialQ = supabase.from("registro_solicitud").select(COLUMNAS_HISTORIAL).order("created_at", { ascending: false }).limit(LIMITE_HISTORIAL);
  if (filtro === "revision") historialQ = historialQ.in("estado", EN_REVISION);

  const [{ data: cambios }, { data: firmas }, { data: ambiguas }, { data: historialBase }, { count: nRev }] = await Promise.all([
    supabase.from("registro_cambio").select("id, cliente_id, solicitud_id, campo, valor_actual, valor_nuevo, created_at").eq("estado", "pendiente").order("created_at"),
    supabase.from("consentimiento_firma").select("id, solicitud_id, firmante_nombre, firmante_parentesco, menor_nombre, menor_documento, firmado_el").eq("estado", "pendiente_asignar").order("firmado_el"),
    supabase.from("registro_solicitud").select("id, payload, created_at").eq("estado", "en_revision").eq("tipo", "datos").is("cliente_id", null).order("created_at"),
    historialQ,
    supabase.from("registro_solicitud").select("id", { count: "exact", head: true }).in("estado", EN_REVISION),
  ]);
  // Con el filtro de revisión, se trae también la otra mitad de cada visita (los datos de una firma
  // descartada, por ejemplo) para que la fila salga completa.
  let historial = historialBase ?? [];
  const sesionesRevision = filtro === "revision" ? Array.from(new Set(historial.map((h) => h.sesion_id).filter((x): x is string => !!x))) : [];
  if (sesionesRevision.length) {
    const { data: pareja } = await supabase.from("registro_solicitud").select(COLUMNAS_HISTORIAL).in("sesion_id", sesionesRevision);
    const ya = new Set(historial.map((h) => h.id));
    historial = [...historial, ...(pareja ?? []).filter((h) => !ya.has(h.id))].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  // Nombres de las fichas (cambios + historial) y quién propuso cada cambio (su solicitud).
  const clienteIds = Array.from(new Set([...(cambios ?? []).map((c) => c.cliente_id), ...historial.map((h) => h.cliente_id).filter((x): x is number => x != null)]));
  const solIds = Array.from(new Set((cambios ?? []).map((c) => c.solicitud_id)));
  // En el historial, "Deportista" es la persona registrada (el miembro), no el titular de la ficha:
  // si un papá registra a dos hijos, salen los dos hijos (pedido de la clienta, 28-oct-2026).
  const miembroIds = Array.from(new Set(historial.map((h) => h.miembro_id).filter((x): x is number => x != null)));
  const [{ data: clientes }, { data: sols }, { data: miembros }] = await Promise.all([
    clienteIds.length ? supabase.from("clientes").select("id, nombres, apellidos").in("id", clienteIds) : Promise.resolve({ data: [] as { id: number; nombres: string; apellidos: string }[] }),
    solIds.length ? supabase.from("registro_solicitud").select("id, payload").in("id", solIds) : Promise.resolve({ data: [] as { id: string; payload: unknown }[] }),
    miembroIds.length ? supabase.from("cliente_miembros").select("id, nombres, apellidos").in("id", miembroIds) : Promise.resolve({ data: [] as { id: number; nombres: string; apellidos: string }[] }),
  ]);
  const nombre = new Map((clientes ?? []).map((c) => [c.id, `${c.nombres} ${c.apellidos}`]));
  const nombreMiembro = new Map((miembros ?? []).map((m) => [m.id, `${m.nombres} ${m.apellidos}`.trim()]));
  const propuso = new Map((sols ?? []).map((s) => [s.id, quienEnvio((s.payload as Payload) ?? {})]));

  // Por qué quedó cada firma sin dueño (documento con otro nombre, o dos fichas iguales): está en su solicitud.
  const solFirmaIds = (firmas ?? []).map((f) => f.solicitud_id).filter((x): x is string => !!x);
  const { data: solsFirma } = solFirmaIds.length
    ? await supabase.from("registro_solicitud").select("id, payload").in("id", solFirmaIds)
    : { data: [] as { id: string; payload: unknown }[] };
  const motivoFirma = new Map((solsFirma ?? []).map((x) => [x.id, (x.payload as Payload)?.busqueda?.tipo]));

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

  // Lo que de verdad falta por decidir de cada solicitud (28-oct-2026): `resultado.cambios_pendientes`
  // es una foto del momento en que llegó y no baja al aprobar.
  const porDecidir = new Map<string, number>();
  for (const c of cambios ?? []) porDecidir.set(c.solicitud_id, (porDecidir.get(c.solicitud_id) ?? 0) + 1);

  // Una fila por persona y visita: los datos y la firma que llegan juntos van en la misma fila
  // (opción A, 28-oct-2026). Las visitas viejas no tienen sesión: se agrupan por día.
  type Solicitud = (typeof historial)[number];
  type Fila = { clave: string; cuando: string; datos?: Solicitud; firma?: Solicitud };
  const porPersona = new Map<string, Fila>();
  for (const h of historial) {
    const clave = h.miembro_id == null ? h.id : `${h.sesion_id ?? h.created_at.slice(0, 10)}·${h.miembro_id}`;
    const f = porPersona.get(clave) ?? { clave, cuando: h.created_at };
    if (h.tipo === "datos") f.datos ??= h;
    else f.firma ??= h;
    if (h.created_at < f.cuando) f.cuando = h.created_at;
    porPersona.set(clave, f);
  }
  let filasHistorial = Array.from(porPersona.values()).sort((a, b) => b.cuando.localeCompare(a.cuando));
  if (filtro === "revision") filasHistorial = filasHistorial.filter((f) => [f.datos, f.firma].some((s) => s && (EN_REVISION as readonly string[]).includes(s.estado)));
  // Con el tope, la visita más vieja puede venir partida (solo la firma): mejor no mostrarla.
  else if (historial.length === LIMITE_HISTORIAL) filasHistorial = filasHistorial.slice(0, -1);

  // Una sola cola, lo más antiguo primero.
  const porFicha = new Map<number, NonNullable<typeof cambios>>();
  for (const c of cambios ?? []) porFicha.set(c.cliente_id, [...(porFicha.get(c.cliente_id) ?? []), c]);

  // Un NIT propuesto que ya es de OTRA ficha no se puede aprobar (un NIT, una ficha): se avisa de
  // cuál es, para unir las fichas si son la misma familia (como Catalina Obando, 21-oct-2026).
  const nitsPropuestos = (cambios ?? []).filter((c) => c.campo === "factura_a_nit" && c.valor_nuevo);
  const duenoNit = new Map<number, { id: number; nombre: string }>();
  await Promise.all(
    nitsPropuestos.map(async (c) => {
      const nit = c.valor_nuevo!;
      const [{ data: porDoc }, { data: porExtra }] = await Promise.all([
        supabase.from("clientes").select("id, nombres, apellidos").or(`documento.eq.${nit},factura_a_nit.eq.${nit}`).neq("id", c.cliente_id).limit(1),
        supabase.from("cliente_facturacion_extra").select("cliente_id").eq("nit", nit).neq("cliente_id", c.cliente_id).limit(1),
      ]);
      let otro = porDoc?.[0];
      if (!otro && porExtra?.[0]) {
        const { data } = await supabase.from("clientes").select("id, nombres, apellidos").eq("id", porExtra[0].cliente_id).maybeSingle();
        otro = data ?? undefined;
      }
      if (otro) duenoNit.set(c.cliente_id, { id: otro.id, nombre: `${otro.nombres} ${otro.apellidos}`.trim() });
    }),
  );
  type Item = { cuando: string; nodo: React.ReactNode };
  const cola: Item[] = [
    ...Array.from(porFicha.entries()).map(([clienteId, lista]) => {
      // La ficha ya factura a otro NIT: aprobar AGREGA estos datos como uno más (21-oct-2026),
      // así que no se tacha nada — lo que tiene se conserva.
      const nitCambio = lista.find((c) => c.campo === "factura_a_nit");
      const agrega = !!nitCambio?.valor_actual;
      const dueno = duenoNit.get(clienteId);
      return {
        cuando: lista[0].created_at,
        nodo: (
          <Pendiente key={`c${clienteId}`} tipo="Facturación" destacado titulo={nombre.get(clienteId) ?? `Ficha ${clienteId}`} href={`/clientes/${clienteId}`} meta={`propuesto por ${propuso.get(lista[0].solicitud_id) ?? "la familia"} · ${fechaHoraCorta(lista[0].created_at)}`}>
            {agrega && (
              <p className="text-muted-foreground text-sm">
                Otro dato de facturación para la ficha. Se conserva el que ya tiene (NIT {nitCambio!.valor_actual}).
              </p>
            )}
            <div className={cn("grid gap-3", lista.length > 1 && "md:grid-cols-2")}>
              {lista.map((c) => (
                <div key={c.id} className="rounded-xl border p-3">
                  <p className="cdaf-eyebrow text-muted-foreground text-[11px]">{CAMPO[c.campo] ?? c.campo}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                    {!agrega && (
                      <>
                        <span className="text-muted-foreground line-through">{mostrar(c.campo, c.valor_actual)}</span>
                        <ArrowRight className="text-muted-foreground size-4 shrink-0" />
                      </>
                    )}
                    <span className="font-semibold">{mostrar(c.campo, c.valor_nuevo)}</span>
                  </p>
                </div>
              ))}
            </div>
            {dueno && (
              <p className="border-warning/40 bg-warning/10 rounded-lg border px-3 py-2 text-sm">
                Ese NIT ya es de la ficha de{" "}
                <Link href={`/clientes/${dueno.id}`} className="font-medium hover:underline">{dueno.nombre}</Link>. Si son
                la misma familia, hay que unir las fichas; si no, recházalo.
              </p>
            )}
            <DecidirCambios ids={lista.map((c) => c.id)} esNit={!!nitCambio} agrega={agrega} bloqueado={!!dueno} />
          </Pendiente>
        ),
      };
    }),
    ...(firmas ?? []).map((f) => ({
      cuando: f.firmado_el,
      nodo: (
        <Pendiente key={f.id} tipo="Firma" titulo={f.menor_nombre} meta={`${f.menor_documento ? `doc. ${f.menor_documento} · ` : ""}firmó ${f.firmante_nombre}${f.firmante_parentesco ? ` (${f.firmante_parentesco.toLowerCase()})` : ""} · ${fechaHoraCorta(f.firmado_el)}`}>
          <p className="text-muted-foreground text-sm">{motivoRevision(motivoFirma.get(f.solicitud_id ?? ""), "firma")}</p>
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
            <p className="text-muted-foreground text-sm">{motivoRevision(p.busqueda?.tipo, "datos")}</p>
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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/clientes" className="text-muted-foreground text-sm hover:underline">← Clientes</Link>
          <h1 className="cdaf-headline mt-1">Registros por revisar</h1>
        </div>
        <Link href="/clientes/registros/sin-fotos" className={buttonVariants({ variant: "outline" })}>
          <CameraOff className="size-4" /> Sin autorización de fotos
        </Link>
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
                {f.etiqueta}{f.clave === "revision" ? ` · ${nRev ?? 0}` : ""}
              </Link>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {filasHistorial.length ? (
            <div className="cdaf-table-wrap">
              <table className="cdaf-table">
                <thead><tr><th>Fecha</th><th>Deportista</th><th>Lo registró</th><th>Hizo</th><th>Avisos</th></tr></thead>
                <tbody>
                  {filasHistorial.map(({ clave, cuando, datos, firma }) => {
                    const pd = (datos?.payload as Payload) ?? undefined;
                    const pf = (firma?.payload as Payload) ?? undefined;
                    const escrito = [pd, pf].map((p) => `${p?.menor?.nombres ?? ""} ${p?.menor?.apellidos ?? ""}`.trim()).find(Boolean) ?? "";
                    const miembroId = datos?.miembro_id ?? firma?.miembro_id;
                    const clienteId = datos?.cliente_id ?? firma?.cliente_id;
                    const deportista = (miembroId != null ? nombreMiembro.get(miembroId) : undefined) || escrito || (clienteId ? (nombre.get(clienteId) ?? `Ficha ${clienteId}`) : "—");
                    const nueva = !!(datos?.resultado as { creada?: boolean } | null)?.creada;
                    const pendientes = datos ? (porDecidir.get(datos.id) ?? 0) : 0;
                    const notas = [datos?.nota_revision, firma?.nota_revision].filter(Boolean);
                    return (
                      <tr key={clave}>
                        <td className="text-muted-foreground whitespace-nowrap">{fechaHoraCorta(cuando)}</td>
                        <td>
                          <span className="inline-flex flex-wrap items-center gap-1.5">
                            {clienteId ? <Link href={`/clientes/${clienteId}`} className="font-semibold hover:underline">{deportista}</Link> : <span className="font-semibold">{deportista}</span>}
                            {nueva && <Badge variant="outline">Ficha nueva</Badge>}
                          </span>
                        </td>
                        <td className="text-muted-foreground">{loRegistro(pd, pf, escrito || deportista)}</td>
                        <td className="space-x-1.5 whitespace-nowrap">
                          {datos && <Hizo que="Datos" estado={datos.estado} conFicha={datos.cliente_id != null} />}
                          {firma && <Hizo que="Firma" estado={firma.estado} conFicha />}
                        </td>
                        <td className="space-x-1.5">
                          {pendientes ? <Badge variant="warning">{pendientes} de facturación por aprobar</Badge> : null}
                          {pf?.autoriza?.imagen === false && <Badge variant="warning">Sin fotos</Badge>}
                          {notas.map((n) => <span key={n} className="text-muted-foreground text-xs">“{n}”</span>)}
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

/**
 * Por qué una firma o un formulario quedó en revisión (22-oct-2026). Antes las dos tarjetas decían siempre
 * "más de una ficha", y el caso más común es otro: el documento existe pero el nombre escrito no se parece
 * (un apellido con otra ortografía, o documentos cruzados entre hermanos).
 */
function motivoRevision(tipo: string | undefined, que: "firma" | "datos"): string {
  const accion = que === "firma" ? "¿A cuál ficha pertenece la firma? El PDF entra a esa ficha." : "Escoge la ficha o descártalo.";
  if (tipo === "documento_ajeno") {
    return `El documento coincide con una ficha, pero el nombre no. Revisa si es la misma persona (puede ser un apellido escrito distinto o documentos cruzados entre hermanos). ${accion}`;
  }
  return que === "firma"
    ? `Más de una ficha tiene este documento y este nombre. ${accion}`
    : `El formulario coincide con más de una ficha y no se aplicó. ${accion}`;
}

const comparable = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * "Lo registró" del historial: el acudiente que escribió la familia en los datos ("Andrea Ortiz · madre")
 * o, si no hay, quien firmó. Un adulto que se registra a sí mismo no tiene acudiente y firma sin
 * parentesco y con su propio nombre: "El propio deportista". Es lo que la familia tecleó, no la ficha.
 */
function loRegistro(datos: Payload | undefined, firma: Payload | undefined, deportista: string): string {
  const a = datos?.acudientes?.find((x) => x.principal) ?? datos?.acudientes?.[0];
  if (a?.nombre) {
    const rol = a.rol === "otro" ? a.parentesco?.trim().toLowerCase() || "acudiente" : (a.rol && ROL[a.rol]) || "acudiente";
    return `${a.nombre} · ${rol}`;
  }
  const f = firma?.firmante ?? datos?.firmante;
  if (f?.nombre) {
    if (f.parentesco?.trim()) return `${f.nombre} · ${f.parentesco.trim().toLowerCase()}`;
    return comparable(f.nombre) === comparable(deportista) ? "El propio deportista" : f.nombre;
  }
  return datos?.acudientes && !datos.acudientes.length ? "El propio deportista" : "—";
}

/** Una de las dos marcas de "Hizo": verde si quedó en la ficha; ámbar si espera a alguien; gris si se descartó. */
function Hizo({ que, estado, conFicha }: { que: "Datos" | "Firma"; estado: string; conFicha: boolean }) {
  if (estado === "aplicada" || (estado === "en_revision" && conFicha && que === "Datos")) return <Badge variant="success">{que}</Badge>;
  if (estado === "en_revision") return <Badge variant="warning">{que} por asignar</Badge>;
  if (estado === "rechazada") return <Badge variant="outline">{que === "Datos" ? "Datos descartados" : "Firma descartada"}</Badge>;
  return <Badge variant="outline">{que} · {(ESTADO[estado] ?? estado).toLowerCase()}</Badge>;
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
