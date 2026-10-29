import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PUEDE_REVISAR_REGISTROS } from "@/lib/registro/revision";
import { soloDigitos } from "@/lib/registro/match";
import { edadDesde } from "@/lib/validations/cliente";
import { fechaHoraCorta } from "@/lib/fecha";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { ArrowRight, CameraOff, Check, ChevronLeft, ChevronRight, ClipboardList, Inbox, PenLine, Receipt } from "lucide-react";
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
// (opción A, Laura, 28-oct-2026), así que ya no se filtra por tipo. Va de 20 en 20.
const FILTROS = [
  { clave: "", etiqueta: "Todo" },
  { clave: "revision", etiqueta: "Con revisión" },
] as const;
const POR_PAGINA = 20;

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
export default async function RegistrosPage({ searchParams }: { searchParams: Promise<{ filtro?: string; pagina?: string }> }) {
  await requireRole(PUEDE_REVISAR_REGISTROS);
  const { filtro: filtroCrudo = "", pagina: paginaCruda } = await searchParams;
  const filtro = filtroCrudo === "revision" ? "revision" : "";
  const pedida = Math.max(1, Math.floor(Number(paginaCruda)) || 1);
  const supabase = await createClient();

  // El historial lo agrupa y pagina la base (`registro_historial`): una fila por persona y visita.
  const historialDe = (pagina: number) =>
    supabase.rpc("registro_historial", { p_solo_revision: filtro === "revision", p_limite: POR_PAGINA, p_desde: (pagina - 1) * POR_PAGINA });

  // "Con revisión" = solo lo que espera a alguien; lo descartado queda en "Todo" (Laura, 28-oct-2026).
  const [{ data: cambios }, { data: firmas }, { data: ambiguas }, { data: hist }, { data: revision }] = await Promise.all([
    supabase.from("registro_cambio").select("id, cliente_id, solicitud_id, campo, valor_actual, valor_nuevo, created_at").eq("estado", "pendiente").order("created_at"),
    supabase.from("consentimiento_firma").select("id, solicitud_id, firmante_nombre, firmante_parentesco, menor_nombre, menor_documento, firmado_el").eq("estado", "pendiente_asignar").order("firmado_el"),
    supabase.from("registro_solicitud").select("id, payload, created_at").eq("estado", "en_revision").eq("tipo", "datos").is("cliente_id", null).order("created_at"),
    historialDe(pedida),
    supabase.rpc("registro_historial", { p_solo_revision: true, p_limite: 1, p_desde: 0 }),
  ]);
  const nRev = revision?.total ?? 0;
  const totalHistorial = hist?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(totalHistorial / POR_PAGINA));
  // Una página que ya no existe (el enlace viejo de un filtro que se vació) cae en la última.
  const pagina = Math.min(pedida, paginas);
  const grupos = pagina === pedida ? (hist?.filas ?? []) : ((await historialDe(pagina)).data?.filas ?? []);
  const solHistorialIds = grupos.flatMap((g) => [g.datos_id, g.firma_id]).filter((x): x is string => !!x);
  const { data: solHistorial } = solHistorialIds.length
    ? await supabase.from("registro_solicitud").select("id, tipo, estado, cliente_id, miembro_id, created_at, resultado, nota_revision, payload").in("id", solHistorialIds)
    : { data: [] };
  const historial = solHistorial ?? [];

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

  // Una fila por persona y visita, en el orden que dio la base (opción A, 28-oct-2026).
  const solPorId = new Map(historial.map((h) => [h.id, h]));
  const filasHistorial = grupos.map((g) => ({
    clave: g.clave,
    cuando: g.cuando,
    datos: g.datos_id ? solPorId.get(g.datos_id) : undefined,
    firma: g.firma_id ? solPorId.get(g.firma_id) : undefined,
  }));
  const primera = totalHistorial ? (pagina - 1) * POR_PAGINA + 1 : 0;
  const ultima = (pagina - 1) * POR_PAGINA + filasHistorial.length;
  const enlacePagina = (n: number) => {
    const q = new URLSearchParams();
    if (filtro) q.set("filtro", filtro);
    if (n > 1) q.set("pagina", String(n));
    const s = q.toString();
    return s ? `/clientes/registros?${s}` : "/clientes/registros";
  };

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

      {/* Historial · propuesta A "Tabla marcador" (Laura, 28-oct-2026), sin el círculo de iniciales. */}
      <section className="bg-card overflow-hidden rounded-xl shadow-sm ring-1 ring-foreground/[0.06]">
        <div className="flex flex-wrap items-end justify-between gap-4 px-6 pt-6 pb-5">
          <div>
            <p className="font-heading text-muted-foreground flex items-center gap-2 text-[11px] font-extrabold tracking-[0.14em] uppercase italic">
              <span className="bg-primary size-2 rounded-full" aria-hidden="true" />
              Registro por QR
            </p>
            <h2 className="font-heading mt-1.5 text-2xl font-bold tracking-tight">Historial</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              {filtro ? `${totalHistorial} esperando revisión` : `${totalHistorial} ${totalHistorial === 1 ? "deportista registrado" : "deportistas registrados"}`}
            </p>
          </div>
          <nav aria-label="Filtrar el historial" className="bg-muted inline-flex gap-1 rounded-full p-1">
            {FILTROS.map((f) => (
              <Link
                key={f.clave}
                href={f.clave ? `/clientes/registros?filtro=${f.clave}` : "/clientes/registros"}
                aria-current={filtro === f.clave ? "page" : undefined}
                className={cn(
                  "inline-flex h-10 items-center gap-2 rounded-full px-4 text-[13px] font-semibold transition-colors",
                  filtro === f.clave ? "bg-stadium text-white" : "text-foreground/80 hover:bg-card",
                )}
              >
                {f.etiqueta}
                {f.clave === "revision" && (
                  <span
                    className={cn(
                      "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold tabular-nums",
                      nRev ? "bg-warning text-[#3d2a00]" : filtro === f.clave ? "bg-white/15 text-white" : "bg-card text-muted-foreground",
                    )}
                  >
                    {nRev}
                  </span>
                )}
              </Link>
            ))}
          </nav>
        </div>

        {filasHistorial.length ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] text-sm">
                <thead>
                  <tr className="bg-muted/40 border-border text-muted-foreground border-y text-left text-[11px] font-bold tracking-wider uppercase">
                    <th className="py-3 pr-4 pl-6 font-bold">Fecha</th>
                    <th className="px-4 py-3 font-bold">Deportista</th>
                    <th className="px-4 py-3 font-bold">Lo registró</th>
                    <th className="px-4 py-3 font-bold">Hizo</th>
                    <th className="py-3 pr-6 pl-4 font-bold">Avisos</th>
                  </tr>
                </thead>
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
                    const quien = loRegistro(pd, pf, escrito || deportista);
                    const [dia, hora] = fechaHoraCorta(cuando).split(", ");
                    return (
                      <tr key={clave} className="border-border/60 hover:bg-muted/30 border-b transition-colors last:border-b-0">
                        <td className="py-3.5 pr-4 pl-6 align-middle whitespace-nowrap">
                          <div className="font-heading text-sm font-semibold">{dia}</div>
                          <div className="text-muted-foreground text-xs tabular-nums">{hora}</div>
                        </td>
                        <td className="px-4 py-3.5 align-middle">
                          {clienteId ? (
                            <Link href={`/clientes/${clienteId}`} className="font-semibold hover:underline">{deportista}</Link>
                          ) : (
                            <span className="font-semibold">{deportista}</span>
                          )}
                          {nueva && (
                            <div className="mt-1">
                              <span className="border-border text-foreground/80 inline-flex rounded-full border px-2 py-px text-[11px] font-semibold">Ficha nueva</span>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3.5 align-middle">
                          {quien === "propio" ? (
                            <span className="text-muted-foreground italic">El propio deportista</span>
                          ) : quien ? (
                            <span>
                              {quien.nombre}
                              {quien.rel && <span className="bg-muted text-muted-foreground ml-1.5 rounded-full px-2 py-px text-xs">{quien.rel}</span>}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 align-middle">
                          <div className="flex flex-wrap gap-1.5">
                            <Hizo que="Datos" estado={datos ? (datos.estado === "en_revision" && datos.cliente_id != null ? "aplicada" : datos.estado) : null} />
                            <Hizo que="Firma" estado={firma?.estado ?? null} />
                          </div>
                        </td>
                        <td className="py-3.5 pr-6 pl-4 align-middle">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {pendientes ? <Aviso icono={Receipt}>{pendientes} de facturación por aprobar</Aviso> : null}
                            {pf?.autoriza?.imagen === false && <Aviso icono={CameraOff}>Sin fotos</Aviso>}
                            {notas.map((n) => <span key={n} className="text-muted-foreground text-xs">“{n}”</span>)}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="border-border flex flex-wrap items-center justify-between gap-4 border-t px-6 py-4">
              <p className="text-muted-foreground text-[13px]">
                Mostrando <strong className="text-foreground tabular-nums">{primera}–{ultima}</strong> de <strong className="text-foreground tabular-nums">{totalHistorial}</strong>
              </p>
              {paginas > 1 && (
                <nav aria-label="Páginas del historial" className="flex items-center gap-1.5">
                  <BotonPagina href={pagina > 1 ? enlacePagina(pagina - 1) : null} etiqueta="Página anterior"><ChevronLeft className="size-4" /></BotonPagina>
                  {paginasVisibles(pagina, paginas).map((n, i) =>
                    n === "…" ? (
                      <span key={`e${i}`} className="text-muted-foreground w-6 text-center" aria-hidden="true">…</span>
                    ) : (
                      <BotonPagina key={n} href={enlacePagina(n)} actual={n === pagina} etiqueta={`Página ${n}`}>{n}</BotonPagina>
                    ),
                  )}
                  <BotonPagina href={pagina < paginas ? enlacePagina(pagina + 1) : null} etiqueta="Página siguiente"><ChevronRight className="size-4" /></BotonPagina>
                </nav>
              )}
            </div>
          </>
        ) : (
          <p className="text-muted-foreground border-border border-t px-6 py-8 text-sm">{filtro ? "No hay nada esperando revisión." : "Todavía no ha llegado ninguna solicitud."}</p>
        )}
      </section>
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

const comparable = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * "Lo registró" del historial: el acudiente que escribió la familia en los datos (Andrea Ortiz, madre)
 * o, si no hay, quien firmó. Un adulto que se registra a sí mismo no tiene acudiente y firma sin
 * parentesco y con su propio nombre: "propio". Es lo que la familia tecleó, no la ficha.
 */
function loRegistro(datos: Payload | undefined, firma: Payload | undefined, deportista: string): { nombre: string; rel?: string } | "propio" | null {
  const a = datos?.acudientes?.find((x) => x.principal) ?? datos?.acudientes?.[0];
  if (a?.nombre) {
    const rel = a.rol === "otro" ? a.parentesco?.trim().toLowerCase() || "acudiente" : (a.rol && ROL[a.rol]) || "acudiente";
    return { nombre: a.nombre, rel };
  }
  const f = firma?.firmante ?? datos?.firmante;
  if (f?.nombre) {
    if (f.parentesco?.trim()) return { nombre: f.nombre, rel: f.parentesco.trim().toLowerCase() };
    return comparable(f.nombre) === comparable(deportista) ? "propio" : { nombre: f.nombre };
  }
  return datos?.acudientes && !datos.acudientes.length ? "propio" : null;
}

/**
 * Una de las dos marcas de "Hizo": lima con chulo si quedó en la ficha; ámbar si espera a que alguien la
 * asigne; gris si se descartó; punteada si esa parte no llegó (solo firmó, o solo actualizó datos).
 */
function Hizo({ que, estado }: { que: "Datos" | "Firma"; estado: string | null }) {
  const pill = "inline-flex items-center gap-1.5 rounded-full text-xs font-semibold whitespace-nowrap";
  if (estado === "aplicada") {
    return (
      <span className={cn(pill, "bg-success/25 dark:bg-success/15 dark:text-success py-1 pr-2.5 pl-1 text-[#3f4a08]")}>
        <span className="bg-primary text-stadium inline-flex size-4 items-center justify-center rounded-full" aria-hidden="true"><Check className="size-3" strokeWidth={3} /></span>
        {que}
      </span>
    );
  }
  if (estado == null) return <span className={cn(pill, "border-border text-muted-foreground border border-dashed px-2.5 py-[3px] font-normal")}>Sin {que.toLowerCase()}</span>;
  if (estado === "en_revision") return <span className={cn(pill, "bg-warning/20 dark:bg-warning/15 dark:text-warning px-2.5 py-1 text-[#7a4b00]")}>{que} por asignar</span>;
  if (estado === "rechazada") return <span className={cn(pill, "border-border text-muted-foreground border px-2.5 py-[3px]")}>{que === "Datos" ? "Datos descartados" : "Firma descartada"}</span>;
  return <span className={cn(pill, "border-border text-muted-foreground border px-2.5 py-[3px]")}>{que} · {(ESTADO[estado] ?? estado).toLowerCase()}</span>;
}

/** Un aviso del historial (sin fotos, facturación por aprobar): ámbar, con su ícono. */
function Aviso({ icono: Icono, children }: { icono: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <span className="bg-warning/20 dark:bg-warning/15 dark:text-warning inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-[#7a4b00]">
      <Icono className="size-3.5" />
      {children}
    </span>
  );
}

/** Las páginas a mostrar: la primera, la última y las vecinas de la actual; los saltos van con "…". */
function paginasVisibles(actual: number, total: number): (number | "…")[] {
  const set = new Set([1, total, actual - 1, actual, actual + 1, ...(actual <= 3 ? [2, 3] : []), ...(actual >= total - 2 ? [total - 2, total - 1] : [])]);
  const orden = Array.from(set).filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  let previa = 0;
  for (const n of orden) {
    if (n - previa === 2) out.push(previa + 1);
    else if (n - previa > 2) out.push("…");
    out.push(n);
    previa = n;
  }
  return out;
}

/** Botón del paginador: un enlace (44 px para el dedo); sin `href` queda apagado (primera o última página). */
function BotonPagina({ href, actual, etiqueta, children }: { href: string | null; actual?: boolean; etiqueta: string; children: React.ReactNode }) {
  const base = "font-heading inline-flex size-11 items-center justify-center rounded-xl text-sm tabular-nums transition-colors";
  if (!href) return <span aria-disabled="true" aria-label={etiqueta} className={cn(base, "border-border text-muted-foreground/40 border")}>{children}</span>;
  return (
    <Link
      href={href}
      aria-label={etiqueta}
      aria-current={actual ? "page" : undefined}
      className={cn(base, actual ? "bg-stadium text-primary font-bold" : "border-border bg-card text-foreground/80 hover:bg-muted border font-semibold")}
    >
      {children}
    </Link>
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
