import Link from "next/link";
import { notFound } from "next/navigation";
import { Paperclip, TriangleAlert } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { rolesForModule, can } from "@/lib/auth/permissions";
import { puedeReabrirEvento } from "@/lib/eventos";
import { createClient } from "@/lib/supabase/server";
import { profesoresActivos } from "@/lib/staff";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FacturaLink, type FacturaDetalleData } from "@/components/factura-detalle";
import { VENTANA_CANDIDATAS, correDias } from "@/lib/eventos";
import { cn } from "@/lib/utils";
import { ParticipanteForm, PagoParticipante } from "./participante-form";
import { ProfesorForm } from "./profesor-form";
import { GastoForm, CATEGORIA_LABEL } from "./gasto-form";
import { CerrarEvento, ReabrirEvento } from "./cierre-evento";
import { FacturasCandidatas } from "./facturas-evento";
import { RemoveButton } from "./remove-button";
import { quitarParticipante, quitarProfesor, quitarGasto, soltarFactura } from "../actions";

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const TIPO_LABEL: Record<string, string> = { torneo: "Torneo", clinica: "Clínica", masterclass: "Masterclass", otro: "Otro" };
const ESTADO_LABEL: Record<string, string> = { planeado: "Planeado", en_curso: "En curso", finalizado: "Finalizado", cancelado: "Cancelado" };
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
/** "julio 2026" armado a mano: `Intl` en español no da el mismo texto en Node y en el navegador. */
const mesDe = (iso: string) => `${MESES[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

type NcFila = {
  id: number;
  numero: string | null;
  fecha: string;
  total: number;
  saldo: number;
  nota_credito: number;
  nc_numero: string | null;
};
type LineaFila = {
  factura_id: number;
  codigo: string | null;
  descripcion: string | null;
  cantidad: number;
  monto: number;
  servicio_id: number | null;
};

/**
 * Líneas de un conjunto de facturas, paginando.
 * PostgREST corta en 1000 filas y en el modo ampliado (`?todas=1`) se piden hasta 200
 * facturas, que juntas pasan de mil líneas: sin paginar, el modal de las últimas saldría vacío.
 */
async function lineasDeFacturas(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: number[],
): Promise<LineaFila[]> {
  if (!ids.length) return [];
  const PAGINA = 1000;
  const out: LineaFila[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data } = await supabase
      .from("siigo_factura_lineas")
      .select("factura_id, codigo, descripcion, cantidad, monto, servicio_id")
      .in("factura_id", ids)
      .order("id")
      .range(desde, desde + PAGINA - 1);
    const filas = data ?? [];
    out.push(...filas);
    if (filas.length < PAGINA) break;
  }
  return out;
}

export default async function EventoDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ todas?: string }>;
}) {
  const profile = await requireRole(rolesForModule("eventos"));
  const { id } = await params;
  const eventoId = Number(id);
  // ?todas=1 → candidatas ampliadas: todo lo facturado en las fechas, no solo lo del
  // servicio del evento. Para el asistente que vino al torneo y solo consumió.
  const verTodas = (await searchParams).todas === "1";
  const supabase = await createClient();

  const { data: evento } = await supabase.from("eventos").select("*").eq("id", eventoId).single();
  if (!evento) notFound();

  const cerrado = evento.cerrado_el != null;
  // Con el evento cerrado la cifra está congelada: dejar editar haría que el snapshot
  // publicado en el dashboard dejara de corresponder con el detalle de abajo.
  const puedeEditar = can(profile.role, "eventos", "edit") && !cerrado;

  const [partsRes, profesRes, gastosRes, servicioRes, profesoresRes, pygRes, atadasRes, candidatasRes] = await Promise.all([
    supabase
      .from("evento_participantes")
      .select("id, cliente_id, nombre_externo, telefono_externo, monto, estado")
      .eq("evento_id", eventoId)
      .order("created_at"),
    supabase.from("evento_profesores").select("id, profesor_id, rol, pago").eq("evento_id", eventoId).order("created_at"),
    supabase
      .from("evento_gastos")
      .select("id, concepto, categoria, monto, proveedor, fecha, soporte_path")
      .eq("evento_id", eventoId)
      .order("fecha", { ascending: false }),
    evento.servicio_id
      ? supabase.from("servicios").select("nombre").eq("id", evento.servicio_id).single()
      : Promise.resolve({ data: null as { nombre: string } | null }),
    profesoresActivos(),
    // El P&G se suma en la BASE (RPC): nunca traer facturas fila a fila para agregarlas aquí.
    supabase.rpc("eventos_pyg", { p_evento: eventoId }),
    // Las facturas YA atadas: son el ingreso del evento. Conjunto acotado (las de un torneo).
    supabase
      .from("siigo_facturas")
      .select("id, numero, fecha, cliente_nombre_siigo, total, saldo, nota_credito, nc_numero, estado_conciliacion")
      .eq("evento_id", eventoId)
      .order("fecha"),
    // Candidatas: mismo servicio y ±15 días, sin filtrar por estado_conciliacion — las
    // `auto` y `mostrador` nunca pasan por /pagos, así que este es su único sitio.
    supabase.rpc("evento_facturas_candidatas", {
      p_evento: eventoId,
      p_solo_servicio: !verTodas,
      p_dias_antes: VENTANA_CANDIDATAS.antes,
      p_dias_despues: VENTANA_CANDIDATAS.despues,
    }),
  ]);

  const parts = partsRes.data ?? [];
  const profes = profesRes.data ?? [];
  const gastos = gastosRes.data ?? [];
  const profesores = profesoresRes;

  // Cuántos faltan por cobrar. El "pagado" es control interno del torneo; el ingreso
  // de verdad sigue saliendo de las facturas de Siigo atadas arriba.
  const pendientesPago = parts.filter((p) => p.estado === "inscrito").length;

  const cliIds = parts.map((p) => p.cliente_id).filter((x): x is number => x != null);
  const { data: clientes } = cliIds.length
    ? await supabase.from("clientes").select("id, nombres, apellidos").in("id", cliIds)
    : { data: [] as { id: number; nombres: string; apellidos: string | null }[] };
  const cliNombre = new Map((clientes ?? []).map((c) => [c.id, `${c.nombres} ${c.apellidos ?? ""}`.trim()]));
  const profNombre = new Map(profesores.map((p) => [p.id, p.nombre ?? p.id]));

  // Enlaces temporales para descargar los soportes de gasto (bucket privado).
  const soporteUrl = new Map<number, string>();
  await Promise.all(
    gastos
      .filter((g) => g.soporte_path)
      .map(async (g) => {
        const { data } = await supabase.storage.from("evento-docs").createSignedUrl(g.soporte_path!, 3600);
        if (data?.signedUrl) soporteUrl.set(g.id, data.signedUrl);
      }),
  );

  // P&G en vivo. Si el evento está cerrado, manda el SNAPSHOT: es la cifra que ya está
  // publicada en el dashboard. Si el vivo se movió después del cierre (una factura tardía),
  // se avisa en vez de cambiar el número por debajo.
  const vivo = pygRes.data?.[0];
  const ingresoVivo = Number(vivo?.ingreso_facturado ?? 0);
  const costoVivo = Number(vivo?.costo_total ?? 0);
  const utilidadViva = Number(vivo?.utilidad ?? 0);
  const totalGastos = Number(vivo?.gastos ?? 0);
  const totalProfes = Number(vivo?.pago_profesores ?? 0);
  const cobrado = Number(vivo?.ingreso_cobrado ?? 0);
  const pendienteCobro = Number(vivo?.pendiente_cobro ?? 0);

  const ingreso = cerrado ? evento.cierre_ingreso ?? 0 : ingresoVivo;
  const costo = cerrado ? evento.cierre_costo ?? 0 : costoVivo;
  const utilidad = cerrado ? evento.cierre_utilidad ?? 0 : utilidadViva;
  const desfase = cerrado && (ingresoVivo !== ingreso || costoVivo !== costo);
  const margen = ingreso > 0 ? Math.round((utilidad / ingreso) * 100) : null;

  // ── Facturas del evento: las atadas (su ingreso) y las que aún podrían serlo ──
  const atadas = atadasRes.data ?? [];
  const candidatas = candidatasRes.data ?? [];
  // El aviso del cierre se calcula SIEMPRE sobre las candidatas estrictas (las que tienen
  // cobro del evento). En modo ampliado la lista trae cientos de facturas ajenas y ese
  // conteo convertiría el aviso en una falsa alarma.
  const estrictasRes = verTodas
    ? await supabase.rpc("evento_facturas_candidatas", {
        p_evento: eventoId,
        p_solo_servicio: true,
        p_dias_antes: VENTANA_CANDIDATAS.antes,
        p_dias_despues: VENTANA_CANDIDATAS.despues,
      })
    : candidatasRes;
  // Los totales vienen repetidos en cada fila (window sobre el conjunto completo), así
  // el aviso es exacto aunque la lista venga recortada por el limit del RPC.
  const nCandidatas = Number(estrictasRes.data?.[0]?.n_candidatas ?? 0);
  const montoCandidatas = Number(estrictasRes.data?.[0]?.monto_candidatas ?? 0);
  // La etiqueta sale de las MISMAS constantes que se le pasan al RPC (src/lib/eventos.ts):
  // con el rango escrito en dos sitios, cambiar uno dejaba el texto mintiendo.
  const diaMes = (iso: string) => `${Number(iso.slice(8, 10))} ${MESES[Number(iso.slice(5, 7)) - 1].slice(0, 3)}`;
  const ventana = `${diaMes(correDias(evento.fecha_inicio, -VENTANA_CANDIDATAS.antes))} → ${diaMes(correDias(evento.fecha_fin ?? evento.fecha_inicio, VENTANA_CANDIDATAS.despues))}`;

  // ── Detalle de cada factura para el modal (el mismo de la ficha del cliente) ──
  const idsFactura = [...new Set([...atadas.map((f) => f.id), ...candidatas.map((c) => c.id)])];
  const [{ data: serviciosTodos }, ncRes, lineasFactura] = await Promise.all([
    supabase.from("servicios").select("id, nombre"),
    idsFactura.length
      ? supabase.from("siigo_facturas").select("id, numero, fecha, total, saldo, nota_credito, nc_numero").in("id", idsFactura)
      : Promise.resolve({ data: [] as NcFila[] }),
    lineasDeFacturas(supabase, idsFactura),
  ]);
  const svNombre = new Map((serviciosTodos ?? []).map((s) => [s.id, s.nombre]));
  const lineasPorFactura = new Map<number, typeof lineasFactura>();
  for (const l of lineasFactura) {
    const a = lineasPorFactura.get(l.factura_id) ?? [];
    a.push(l);
    lineasPorFactura.set(l.factura_id, a);
  }
  const detalleFactura = new Map<number, FacturaDetalleData>();
  for (const f of ncRes.data ?? []) {
    detalleFactura.set(f.id, {
      numero: f.numero ?? `#${f.id}`,
      fecha: f.fecha,
      total: f.total,
      saldo: f.saldo,
      notaCredito: f.nota_credito ?? 0,
      ncNumero: f.nc_numero,
      lineas: (lineasPorFactura.get(f.id) ?? []).map((l) => ({
        codigo: l.codigo,
        descripcion: l.descripcion,
        cantidad: Number(l.cantidad),
        monto: l.monto,
        servicio: svNombre.get(l.servicio_id ?? -1) ?? "Sin categoría",
      })),
    });
  }

  const fechaImputacion = evento.fecha_fin ?? evento.fecha_inicio;
  const puedeReabrir = puedeReabrirEvento(profile.role);
  const puedeCerrar = can(profile.role, "eventos", "edit") && !cerrado && evento.estado !== "cancelado";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/eventos" className="text-muted-foreground text-sm hover:underline">
          ← Eventos
        </Link>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="cdaf-headline">{evento.nombre}</h1>
            <Badge variant="secondary">{TIPO_LABEL[evento.tipo] ?? evento.tipo}</Badge>
            {cerrado ? (
              <Badge variant="success">Cerrado</Badge>
            ) : (
              <Badge variant="outline">{ESTADO_LABEL[evento.estado] ?? evento.estado}</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {puedeCerrar && (
              <CerrarEvento
                eventoId={eventoId}
                ingreso={ingresoVivo}
                costo={costoVivo}
                utilidad={utilidadViva}
                pendienteCobro={pendienteCobro}
                mesImputacion={mesDe(fechaImputacion)}
                nCandidatas={nCandidatas}
                montoCandidatas={montoCandidatas}
              />
            )}
            {cerrado && puedeReabrir && <ReabrirEvento eventoId={eventoId} />}
          </div>
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

      {/* ── P&G del evento: el marcador del torneo ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Resultado del evento</CardTitle>
          <p className="text-muted-foreground text-xs">
            {cerrado
              ? "Cifra congelada al cerrar. Es la que aporta al dashboard."
              : "Mientras el evento esté abierto, ni sus ingresos ni su resultado aparecen en el dashboard."}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-muted-foreground text-xs">Ingresos facturados</p>
              <p className="font-heading mt-0.5 text-2xl font-semibold tabular-nums">{COP.format(ingreso)}</p>
              <p className="text-muted-foreground mt-1 text-xs tabular-nums">
                Cobrado {COP.format(cobrado)}
                {pendienteCobro > 0 && ` · por cobrar ${COP.format(pendienteCobro)}`}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Costos</p>
              <p className="font-heading mt-0.5 text-2xl font-semibold tabular-nums">−{COP.format(costo)}</p>
              <p className="text-muted-foreground mt-1 text-xs tabular-nums">
                Gastos {COP.format(totalGastos)} · profesores {COP.format(totalProfes)}
              </p>
            </div>
            <div className="border-primary/40 bg-primary/[0.06] rounded-lg border p-3 sm:-m-1">
              <p className="text-muted-foreground text-xs">Utilidad</p>
              <p
                className={cn(
                  "font-heading mt-0.5 text-2xl font-semibold tabular-nums",
                  utilidad < 0 && "text-destructive",
                )}
              >
                {COP.format(utilidad)}
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                {margen != null ? `Margen ${margen}%` : "Sin ingresos aún"}
              </p>
            </div>
          </div>

          {ingreso === 0 && !cerrado && (
            <p className="border-warning/40 bg-warning/10 rounded-md border px-3 py-2 text-xs">
              Este evento no tiene facturas atadas todavía, así que su ingreso está en cero.
              {nCandidatas > 0
                ? ` Abajo hay ${nCandidatas} factura${nCandidatas === 1 ? "" : "s"} que podría${nCandidatas === 1 ? "" : "n"} ser de este evento.`
                : " En cuanto Siigo traiga las inscripciones aparecerán abajo como candidatas."}
            </p>
          )}

          {desfase && (
            <p className="border-warning/40 bg-warning/10 flex items-start gap-2 rounded-md border px-3 py-2 text-xs">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              <span>
                Después del cierre cambió el detalle: hoy da {COP.format(ingresoVivo)} de ingreso y{" "}
                {COP.format(costoVivo)} de costo. El dashboard sigue mostrando la cifra congelada. Si quieres
                actualizarla, reabre el evento y vuélvelo a cerrar.
              </span>
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Facturas del evento: de dónde sale su ingreso ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Facturas del evento</CardTitle>
          <p className="text-muted-foreground text-xs">
            El ingreso de arriba son estas facturas de Siigo. Atar una factura no la concilia: si es de
            mostrador sigue siendo anónima, solo queda dicho de qué evento es.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          {atadas.length > 0 ? (
            <div className="cdaf-table-wrap">
              <table className="cdaf-table">
                <thead>
                  <tr>
                    <th className="px-4 py-2">Factura</th>
                    <th className="px-4 py-2">Cliente</th>
                    <th className="px-4 py-2">Fecha</th>
                    <th className="px-4 py-2 text-right">Total</th>
                    <th className="px-4 py-2 text-right">Por cobrar</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {atadas.map((f) => (
                    <tr key={f.id} className="border-t">
                      <td className="px-4 py-2 tabular-nums">
                        {detalleFactura.has(f.id) ? (
                          <FacturaLink factura={detalleFactura.get(f.id)!} />
                        ) : (
                          f.numero ?? `#${f.id}`
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {f.cliente_nombre_siigo ?? <span className="text-muted-foreground">Sin identificar</span>}
                      </td>
                      <td className="text-muted-foreground px-4 py-2 tabular-nums">{f.fecha}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{COP.format(f.total)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {f.saldo > 0 ? COP.format(f.saldo) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {puedeEditar && (
                          <RemoveButton action={soltarFactura} id={f.id} eventoId={eventoId} label="Soltar" />
                        )}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-muted/40 border-t font-medium">
                    <td className="px-4 py-2" colSpan={3}>
                      {atadas.length} {atadas.length === 1 ? "factura atada" : "facturas atadas"}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {COP.format(atadas.reduce((s, f) => s + f.total, 0))}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {COP.format(atadas.reduce((s, f) => s + f.saldo, 0))}
                    </td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">Ninguna factura atada todavía.</p>
          )}

          {puedeEditar && !evento.servicio_id && !verTodas && (
            <p className="border-warning/40 bg-warning/10 rounded-md border px-3 py-2 text-xs">
              Este evento no tiene servicio asignado, así que no se pueden proponer facturas candidatas.
              Asígnale uno (p. ej. “Torneo”) para que aparezcan solas, o{" "}
              <Link href={`/eventos/${eventoId}?todas=1`} className="underline">
                mira todas las facturas de estas fechas
              </Link>
              .
            </p>
          )}

          {puedeEditar && (evento.servicio_id != null || verTodas) && (
            <div className="border-t pt-4">
              <h3 className="font-heading mb-2 text-sm font-semibold">
                {verTodas ? "Todas las facturas de las fechas" : "Candidatas"}{" "}
                {nCandidatas > 0 && !verTodas && (
                  <span className="text-muted-foreground font-sans font-normal tabular-nums">
                    {nCandidatas} · {COP.format(montoCandidatas)}
                  </span>
                )}
              </h3>
              {candidatas.length > 0 ? (
                <FacturasCandidatas
                  key={candidatas.map((c) => c.id).join("-")}
                  eventoId={eventoId}
                  candidatas={candidatas.map((c) => ({ ...c, detalleFactura: detalleFactura.get(c.id) ?? null }))}
                  ventana={ventana}
                  todas={verTodas}
                />
              ) : (
                <p className="text-muted-foreground text-sm">
                  {verTodas
                    ? `No hay facturas sin atar entre ${ventana}.`
                    : `No hay facturas sueltas de ${servicioRes.data?.nombre ?? "este servicio"} entre ${ventana}.`}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Gastos ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Gastos</CardTitle>
          <p className="text-muted-foreground text-xs">
            Refrigerios, premios, logística… Lo que se le paga a los profesores del evento NO va aquí: el
            resultado ya lo toma de la sección de profesores. Un gasto en <strong>$0</strong> es válido:
            sirve para dejar constancia de lo que cubrió un patrocinador sin costarle al club.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {gastos.length > 0 ? (
            <div className="cdaf-table-wrap">
              <table className="cdaf-table">
                <thead>
                  <tr>
                    <th className="px-4 py-2">Concepto</th>
                    <th className="px-4 py-2">Categoría</th>
                    <th className="px-4 py-2">Proveedor</th>
                    <th className="px-4 py-2">Fecha</th>
                    <th className="px-4 py-2 text-right">Monto</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {gastos.map((g) => (
                    <tr key={g.id} className="border-t">
                      <td className="px-4 py-2">
                        {g.concepto}
                        {soporteUrl.has(g.id) && (
                          <a
                            href={soporteUrl.get(g.id)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground hover:text-foreground ml-1.5 inline-flex align-middle"
                            title="Ver soporte"
                          >
                            <Paperclip className="size-3.5" />
                          </a>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <Badge variant="outline">{CATEGORIA_LABEL[g.categoria] ?? g.categoria}</Badge>
                      </td>
                      <td className="text-muted-foreground px-4 py-2">{g.proveedor ?? "—"}</td>
                      <td className="text-muted-foreground px-4 py-2 tabular-nums">{g.fecha}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{COP.format(g.monto)}</td>
                      <td className="px-4 py-2 text-right">
                        {puedeEditar && <RemoveButton action={quitarGasto} id={g.id} eventoId={eventoId} />}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-muted/40 border-t font-medium">
                    <td className="px-4 py-2" colSpan={4}>Total gastos</td>
                    <td className="px-4 py-2 text-right tabular-nums">{COP.format(totalGastos)}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">Aún no hay gastos registrados.</p>
          )}
          {puedeEditar && (
            <div className="border-t pt-3">
              <GastoForm eventoId={eventoId} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Participantes */}
      <Card>
        <CardHeader>
          <CardTitle>
            Participantes{" "}
            <span className="text-muted-foreground text-sm font-normal tabular-nums">
              {parts.length}
              {evento.cupo ? ` / ${evento.cupo}` : ""}
              {pendientesPago > 0 && ` · ${pendientesPago} sin pagar`}
            </span>
          </CardTitle>
        </CardHeader>
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
                  <span className="flex items-center gap-2">
                    <span className="text-muted-foreground tabular-nums">{COP.format(p.monto ?? 0)}</span>
                    {/* La insignia sale del ESTADO. Antes salía de `monto > 0`, así que teclear
                        el valor de la inscripción ya lo daba por cobrado. */}
                    {p.estado === "cancelado" ? (
                      <Badge variant="outline" className="text-muted-foreground">Cancelado</Badge>
                    ) : p.estado === "pagado" ? (
                      <Badge variant="success">Pagado</Badge>
                    ) : (
                      <Badge variant="outline">Pendiente</Badge>
                    )}
                    {puedeEditar && p.estado !== "cancelado" && (
                      <PagoParticipante id={p.id} eventoId={eventoId} pagado={p.estado === "pagado"} />
                    )}
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
                El pago de cada profesor se suma a su Liquidación del periodo, etiquetado como “Evento”, y
                cuenta como costo en el resultado de arriba.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {cerrado && (
        <p className="text-muted-foreground text-xs">
          Evento cerrado el {new Date(evento.cerrado_el!).toLocaleDateString("es-CO")}. Para editarlo hay que
          reabrirlo{puedeReabrir ? "" : " (solo el superadministrador o el coordinador deportivo)"}.
        </p>
      )}
    </div>
  );
}
