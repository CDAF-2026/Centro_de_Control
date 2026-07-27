import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { rolesForModule, can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { EstadoForm } from "./estado-form";
import { Documentos, type DocItem } from "./documentos";
import { ServiciosCliente } from "./servicios-cliente";
import { FacturaLink, type FacturaDetalleData } from "./factura-detalle";
import { Hermanos, type Miembro } from "./hermanos";
import { documentoLegible } from "../documento";

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const FECHA_CORTA = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short" });
const fechaCorta = (iso: string) => FECHA_CORTA.format(new Date(`${iso}T00:00:00`));

export default async function ClienteDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await requireRole(rolesForModule("clientes"));
  const { id } = await params;

  const supabase = await createClient();
  const { data: cliente } = await supabase
    .from("clientes")
    .select(
      "id, nombres, apellidos, documento, tipo_documento, fecha_nacimiento, es_menor, celular, email, emergencia_nombre, emergencia_celular, emergencia_parentesco, factura_a_nombre, factura_a_nit, deportes, estado, acudiente_id",
    )
    .eq("id", Number(id))
    .single();
  if (!cliente) notFound();

  let acudiente: { nombre: string; documento: string | null; telefono: string | null; parentesco: string | null } | null = null;
  if (cliente.acudiente_id) {
    const { data } = await supabase
      .from("acudientes")
      .select("nombre, documento, telefono, parentesco")
      .eq("id", cliente.acudiente_id)
      .single();
    acudiente = data ?? null;
  }

  const { data: miembrosRaw } = await supabase
    .from("cliente_miembros")
    .select("id, nombres, apellidos, fecha_nacimiento, documento, deportes, es_titular")
    .eq("cliente_id", Number(id))
    .eq("activo", true)
    .order("es_titular", { ascending: false })
    .order("created_at");
  const miembros: Miembro[] = miembrosRaw ?? [];

  const { data: docsRaw } = await supabase
    .from("cliente_documentos")
    .select("id, tipo, nombre_archivo, storage_path")
    .eq("cliente_id", Number(id))
    .order("created_at", { ascending: false });
  const docs: DocItem[] = await Promise.all(
    (docsRaw ?? []).map(async (d) => {
      const { data: signed } = await supabase.storage
        .from("cliente-docs")
        .createSignedUrl(d.storage_path, 3600);
      return { ...d, url: signed?.signedUrl ?? null };
    }),
  );

  const miembroNombre = new Map(miembros.map((m) => [m.id, m.nombres]));
  const conMiembro = (mid: number | null) => (mid != null && miembros.length > 1 ? miembroNombre.get(mid) ?? null : null);

  const { data: inscripciones } = await supabase
    .from("inscripciones")
    .select("id, academia_id, miembro_id, plan_frecuencia, descuento_pct, fecha_inscripcion, dias")
    .eq("cliente_id", Number(id))
    .eq("activa", true);
  const acaIds = (inscripciones ?? []).map((i) => i.academia_id);
  const { data: acaData } = acaIds.length
    ? await supabase.from("academias").select("id, nombre, precio, matricula, deporte, dias_semana").in("id", acaIds)
    : { data: [] as { id: number; nombre: string; precio: number; matricula: number; deporte: "tenis" | "padel"; dias_semana: number[] }[] };
  const acaById = new Map((acaData ?? []).map((a) => [a.id, a.nombre]));
  const inscripcionesView = (inscripciones ?? []).map((i) => ({
    id: i.id,
    plan_frecuencia: i.plan_frecuencia,
    descuento_pct: i.descuento_pct,
    dias: i.dias,
    academiaNombre: acaById.get(i.academia_id) ?? `Academia #${i.academia_id}`,
    miembro: conMiembro(i.miembro_id),
  }));

  const { data: pqCli } = await supabase
    .from("paquetes_cliente")
    .select("id, catalogo_id, miembro_id, num_clases, clases_consumidas, estado, descuento_pct, vence_el")
    .eq("cliente_id", Number(id))
    .order("created_at", { ascending: false });
  const catIds = (pqCli ?? []).map((p) => p.catalogo_id).filter((x): x is number => x != null);
  const { data: catNames } = catIds.length
    ? await supabase.from("paquetes_catalogo").select("id, nombre, precio, descuento_pct").in("id", catIds)
    : { data: [] as { id: number; nombre: string; precio: number; descuento_pct: number }[] };
  const catNameById = new Map((catNames ?? []).map((c) => [c.id, c.nombre]));
  const paquetesView = (pqCli ?? []).map((p) => ({
    id: p.id,
    num_clases: p.num_clases,
    clases_consumidas: p.clases_consumidas,
    estado: p.estado,
    descuento_pct: p.descuento_pct,
    nombre: p.catalogo_id ? catNameById.get(p.catalogo_id) ?? "Paquete" : "Paquete",
    vence: p.vence_el,
    miembro: conMiembro(p.miembro_id),
  }));

  const { data: catalogoActivo } = await supabase
    .from("paquetes_catalogo")
    .select("id, nombre, num_clases")
    .eq("activo", true)
    .order("num_clases");

  const puedeEditar = can(profile.role, "clientes", "edit");

  // ── Situación financiera: facturado / pagado / saldo desde Siigo (Siigo manda) ──
  const verFinanzas = can(profile.role, "cliente_finanzas");
  let resumenSiigo: { servicioId: number | null; nombre: string; facturado: number; pagado: number; saldo: number }[] = [];
  // Todas las facturas que componen cada servicio (pagadas, pendientes y anuladas),
  // para que el "Facturado" sea rastreable y no parezca inflado.
  const facturasPorServicio = new Map<
    number | null,
    { numero: string; fecha: string; facturado: number; pagado: number; pendiente: number; notaCredito: number }[]
  >();
  const detallePorFactura = new Map<string, FacturaDetalleData>();
  let facturadoTotal = 0;
  let pagadoTotal = 0;
  if (verFinanzas) {
    const [{ data: resumen }, { data: servicios }, { data: pendientes }] = await Promise.all([
      supabase.rpc("siigo_resumen_cliente", { p_cliente: Number(id) }),
      supabase.from("servicios").select("id, nombre"),
      supabase.rpc("siigo_facturas_cliente_servicio", { p_cliente: Number(id) }),
    ]);
    for (const p of pendientes ?? []) {
      const key = p.servicio_id ?? null;
      const arr = facturasPorServicio.get(key) ?? [];
      arr.push({
        numero: p.numero,
        fecha: p.fecha,
        facturado: Number(p.facturado),
        pagado: Number(p.pagado),
        pendiente: Number(p.pendiente),
        notaCredito: Number(p.nota_credito),
      });
      facturasPorServicio.set(key, arr);
    }
    const svName = new Map((servicios ?? []).map((sv) => [sv.id, sv.nombre]));

    // Detalle de TODAS sus facturas (para el modal al clicar cualquier número).
    const { data: facsPend } = await supabase
      .from("siigo_facturas")
      .select("id, numero, fecha, total, saldo, nota_credito, nc_numero")
      .eq("cliente_id", Number(id))
      .order("fecha");
    const idsPend = (facsPend ?? []).map((f) => f.id);
    const { data: lineasPend } = idsPend.length
      ? await supabase
          .from("siigo_factura_lineas")
          .select("factura_id, codigo, descripcion, cantidad, monto, servicio_id")
          .in("factura_id", idsPend)
          .order("monto", { ascending: false })
      : { data: [] as { factura_id: number; codigo: string | null; descripcion: string | null; cantidad: number; monto: number; servicio_id: number | null }[] };
    for (const f of facsPend ?? []) {
      if (!f.numero) continue; // sin número no hay a qué enlazar
      detallePorFactura.set(f.numero, {
        numero: f.numero,
        fecha: f.fecha,
        total: f.total,
        saldo: f.saldo,
        notaCredito: f.nota_credito ?? 0,
        ncNumero: f.nc_numero,
        lineas: (lineasPend ?? [])
          .filter((l) => l.factura_id === f.id)
          .map((l) => ({
            codigo: l.codigo,
            descripcion: l.descripcion,
            cantidad: Number(l.cantidad),
            monto: l.monto,
            servicio: l.servicio_id != null ? svName.get(l.servicio_id) ?? "Sin categoría" : "Sin categoría",
          })),
      });
    }
    resumenSiigo = (resumen ?? [])
      .map((r) => {
        const facturado = Number(r.facturado);
        const pagado = Number(r.pagado);
        return {
          servicioId: r.servicio_id ?? null,
          nombre: r.servicio_id != null ? svName.get(r.servicio_id) ?? "Sin categoría" : "Sin categoría",
          facturado,
          pagado,
          saldo: facturado - pagado,
        };
      })
      .sort((a, b) => b.facturado - a.facturado);
    facturadoTotal = resumenSiigo.reduce((s, r) => s + r.facturado, 0);
    pagadoTotal = resumenSiigo.reduce((s, r) => s + r.pagado, 0);
  }
  const saldoTotal = facturadoTotal - pagadoTotal;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href="/clientes" className="text-muted-foreground text-sm hover:underline">
          ← Clientes
        </Link>
        <div className="mt-1 flex items-center justify-between gap-3">
          <h1 className="cdaf-headline">
            {cliente.nombres} {cliente.apellidos}
          </h1>
          {puedeEditar && (
            <div className="flex items-center gap-2">
              <Link href={`/clientes/${cliente.id}/editar`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                Editar
              </Link>
              <EstadoForm id={cliente.id} estado={cliente.estado} />
            </div>
          )}
        </div>
        <div className="mt-2 flex items-center gap-2">
          {cliente.estado === "activo" ? (
            <Badge variant="secondary">Activo</Badge>
          ) : (
            <Badge variant="outline">Retirado</Badge>
          )}
          {cliente.es_menor && <Badge variant="outline">Menor de edad</Badge>}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Datos</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm">
          <Dato label="Documento" valor={documentoLegible(cliente.tipo_documento, cliente.documento)} />
          <Dato label="Fecha de nacimiento" valor={cliente.fecha_nacimiento} />
          <Dato label="Celular" valor={cliente.celular} />
          <Dato label="Correo" valor={cliente.email} />
          <Dato label="Deportes" valor={(cliente.deportes ?? []).map((d) => (d === "tenis" ? "Tenis" : "Pádel")).join(" · ") || null} />
          <Dato
            label="Contacto de emergencia"
            valor={
              [cliente.emergencia_nombre, cliente.emergencia_celular, cliente.emergencia_parentesco]
                .filter(Boolean)
                .join(" · ") || null
            }
          />
          <Dato
            label="Se factura a nombre de"
            valor={
              cliente.factura_a_nombre || cliente.factura_a_nit
                ? [cliente.factura_a_nombre, cliente.factura_a_nit && `NIT ${cliente.factura_a_nit}`]
                    .filter(Boolean)
                    .join(" · ")
                : null
            }
          />
        </CardContent>
      </Card>

      {acudiente && (
        <Card>
          <CardHeader>
            <CardTitle>Acudiente</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 text-sm">
            <Dato label="Nombre" valor={acudiente.nombre} />
            <Dato label="Parentesco" valor={acudiente.parentesco} />
            <Dato label="Documento" valor={acudiente.documento} />
            <Dato label="Teléfono" valor={acudiente.telefono} />
          </CardContent>
        </Card>
      )}

      {cliente.es_menor && (
        <Card>
          <CardHeader>
            <CardTitle>Hermanos</CardTitle>
            <CardDescription>Miembros de esta ficha familiar. La situación financiera es única para toda la familia.</CardDescription>
          </CardHeader>
          <CardContent>
            <Hermanos clienteId={cliente.id} miembros={miembros} puedeEditar={puedeEditar} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Servicios contratados</CardTitle>
        </CardHeader>
        <CardContent>
          <ServiciosCliente
            clienteId={cliente.id}
            inscripciones={inscripcionesView}
            paquetes={paquetesView}
            catalogo={catalogoActivo ?? []}
            miembros={miembros}
            puedeEditar={puedeEditar}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Documentos</CardTitle>
        </CardHeader>
        <CardContent>
          <Documentos clienteId={cliente.id} docs={docs} puedeEditar={puedeEditar} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Situación financiera</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {verFinanzas && cliente.factura_a_nit && (
            <p className="text-muted-foreground bg-muted/40 rounded-md px-3 py-2 text-xs">
              Incluye las facturas a nombre de{" "}
              <strong className="text-foreground">{cliente.factura_a_nombre || `NIT ${cliente.factura_a_nit}`}</strong>
              {cliente.factura_a_nombre ? ` (NIT ${cliente.factura_a_nit})` : ""}.
            </p>
          )}
          {!verFinanzas ? (
            <p className="text-muted-foreground">Visible solo para administración.</p>
          ) : resumenSiigo.length === 0 ? (
            <p className="text-muted-foreground">
              Sin facturas de Siigo conciliadas a este cliente. Las facturas se asignan en la Bolsa de pagos.
            </p>
          ) : (
            <>
              <ul className="divide-y">
                {resumenSiigo.map((r) => (
                  <li key={r.nombre} className="py-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium">{r.nombre}</span>
                      {r.saldo > 0 ? (
                        <span className="text-destructive font-medium">Debe {COP.format(r.saldo)}</span>
                      ) : (
                        <span className="text-muted-foreground">Al día</span>
                      )}
                    </div>
                    <p className="text-muted-foreground text-xs">
                      Facturado {COP.format(r.facturado)} · Pagado {COP.format(r.pagado)}
                    </p>
                    {(facturasPorServicio.get(r.servicioId) ?? []).length > 0 && (
                      <ul className="border-muted mt-2 space-y-1 border-l-2 pl-3">
                        {(facturasPorServicio.get(r.servicioId) ?? []).map((f) => {
                          const anulada = f.notaCredito > 0 && f.facturado === 0;
                          return (
                            <li key={f.numero} className="flex items-center justify-between gap-3 text-xs">
                              <span className="text-muted-foreground">
                                {detallePorFactura.has(f.numero) ? (
                                  <FacturaLink factura={detallePorFactura.get(f.numero)!} />
                                ) : (
                                  <span className="text-foreground font-medium">{f.numero}</span>
                                )}{" "}
                                · {fechaCorta(f.fecha)}
                              </span>
                              <span className="flex shrink-0 items-center gap-2 tabular-nums">
                                <span className={anulada ? "text-muted-foreground line-through" : ""}>
                                  {COP.format(f.facturado || f.notaCredito)}
                                </span>
                                {anulada ? (
                                  <span className="text-muted-foreground">Anulada</span>
                                ) : f.pendiente > 0 ? (
                                  <span className="text-destructive font-medium">Debe {COP.format(f.pendiente)}</span>
                                ) : (
                                  <span className="text-muted-foreground">Pagada</span>
                                )}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between border-t pt-3 font-semibold">
                <span>Saldo pendiente total</span>
                <span className={saldoTotal > 0 ? "text-destructive" : ""}>{COP.format(saldoTotal)}</span>
              </div>
            </>
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

/** Meses corridos desde una fecha (incluye el mes inicial y el actual); mínimo 1. */
function mesesCorridos(desde: string): number {
  const d = new Date(`${desde}T00:00:00`);
  const now = new Date();
  const m = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth()) + 1;
  return Math.max(1, m);
}
