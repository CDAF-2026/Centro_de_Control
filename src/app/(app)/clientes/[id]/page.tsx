import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { rolesForModule, can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { EstadoForm } from "./estado-form";
import { Documentos, type DocItem } from "./documentos";
import { ServiciosCliente } from "./servicios-cliente";
import { precioFinal } from "@/lib/validations/paquete";
import { esperadoAcademiasCliente } from "@/lib/finanzas";

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

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
      "id, nombres, apellidos, documento, fecha_nacimiento, es_menor, celular, email, emergencia_nombre, emergencia_celular, emergencia_parentesco, deportes, estado, acudiente_id",
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

  const { data: asigns } = await supabase
    .from("asignaciones_pago")
    .select("id, pago_id, servicio, periodos")
    .eq("cliente_id", Number(id))
    .order("created_at", { ascending: false });
  let pagosData: { id: number; monto: number; fecha: string }[] = [];
  const pagoIds = (asigns ?? []).map((a) => a.pago_id);
  if (pagoIds.length) {
    const { data } = await supabase.from("pagos").select("id, monto, fecha").in("id", pagoIds);
    pagosData = data ?? [];
  }
  const pagoById = new Map(pagosData.map((p) => [p.id, p]));
  const totalConciliado = pagosData.reduce((s, p) => s + p.monto, 0);

  const { data: inscripciones } = await supabase
    .from("inscripciones")
    .select("id, academia_id, plan_frecuencia, descuento_pct, fecha_inscripcion, dias")
    .eq("cliente_id", Number(id))
    .eq("activa", true);
  const acaIds = (inscripciones ?? []).map((i) => i.academia_id);
  const { data: acaData } = acaIds.length
    ? await supabase.from("academias").select("id, nombre, precio, matricula, deporte, dias_semana").in("id", acaIds)
    : { data: [] as { id: number; nombre: string; precio: number; matricula: number; deporte: "tenis" | "padel"; dias_semana: number[] }[] };
  const acaById = new Map((acaData ?? []).map((a) => [a.id, a.nombre]));
  const acadInfoMap = new Map(
    (acaData ?? []).map((a) => [a.id, { precio: a.precio, matricula: a.matricula, deporte: a.deporte, dias_semana: a.dias_semana }]),
  );
  const inscripcionesView = (inscripciones ?? []).map((i) => ({
    id: i.id,
    plan_frecuencia: i.plan_frecuencia,
    descuento_pct: i.descuento_pct,
    dias: i.dias,
    academiaNombre: acaById.get(i.academia_id) ?? `Academia #${i.academia_id}`,
  }));

  // Sesiones de academia cobrables del cliente (clases cerradas; la excusa médica no se cobra).
  const sesionesPorAcademia = new Map<number, number>();
  if ((inscripciones ?? []).length) {
    const { data: asisCli } = await supabase
      .from("asistencias")
      .select("clase_id, estado")
      .eq("cliente_id", Number(id));
    const claseIdsAsis = (asisCli ?? []).map((a) => a.clase_id);
    if (claseIdsAsis.length) {
      const { data: clasesAsis } = await supabase
        .from("clases")
        .select("id, academia_id, tipo, estado")
        .in("id", claseIdsAsis);
      const acaDeClase = new Map<number, number>();
      for (const c of clasesAsis ?? []) {
        if (c.tipo === "academia" && c.estado === "realizada" && c.academia_id != null) acaDeClase.set(c.id, c.academia_id);
      }
      for (const a of asisCli ?? []) {
        const acaId = acaDeClase.get(a.clase_id);
        if (acaId == null || a.estado === "excusa_medica") continue;
        sesionesPorAcademia.set(acaId, (sesionesPorAcademia.get(acaId) ?? 0) + 1);
      }
    }
  }

  const { data: pqCli } = await supabase
    .from("paquetes_cliente")
    .select("id, catalogo_id, num_clases, clases_consumidas, estado, descuento_pct")
    .eq("cliente_id", Number(id))
    .order("created_at", { ascending: false });
  const catIds = (pqCli ?? []).map((p) => p.catalogo_id).filter((x): x is number => x != null);
  const { data: catNames } = catIds.length
    ? await supabase.from("paquetes_catalogo").select("id, nombre, precio, descuento_pct").in("id", catIds)
    : { data: [] as { id: number; nombre: string; precio: number; descuento_pct: number }[] };
  const catNameById = new Map((catNames ?? []).map((c) => [c.id, c.nombre]));
  const catFinById = new Map((catNames ?? []).map((c) => [c.id, { precio: c.precio, descuento_pct: c.descuento_pct }]));
  const paquetesView = (pqCli ?? []).map((p) => ({
    id: p.id,
    num_clases: p.num_clases,
    clases_consumidas: p.clases_consumidas,
    estado: p.estado,
    descuento_pct: p.descuento_pct,
    nombre: p.catalogo_id ? catNameById.get(p.catalogo_id) ?? "Paquete" : "Paquete",
  }));

  const { data: catalogoActivo } = await supabase
    .from("paquetes_catalogo")
    .select("id, nombre, num_clases")
    .eq("activo", true)
    .order("num_clases");

  const puedeEditar = can(profile.role, "clientes", "edit");

  // ── Situación financiera: cruce de servicios contratados vs pagos (solo SA/CA) ──
  const verFinanzas = can(profile.role, "cliente_finanzas");

  // Valor de cada paquete = precio final del catálogo (con su descuento) menos el descuento de la asignación.
  const paquetesFin = (pqCli ?? []).map((p) => {
    const cat = p.catalogo_id ? catFinById.get(p.catalogo_id) : null;
    const base = cat ? precioFinal(cat.precio, Number(cat.descuento_pct)) : 0;
    const valor = Math.round(base * (1 - Number(p.descuento_pct) / 100));
    return { id: p.id, nombre: p.catalogo_id ? catNameById.get(p.catalogo_id) ?? "Paquete" : "Paquete", valor };
  });
  const esperadoPaquetes = paquetesFin.reduce((s, p) => s + p.valor, 0);

  // Academia: cobro por sesión (mensualidad ÷ días×4 × sesiones cobrables) + matrícula semestral por deporte.
  const acadFin = esperadoAcademiasCliente(
    (inscripciones ?? []).map((i) => ({
      academia_id: i.academia_id,
      descuento_pct: Number(i.descuento_pct),
      plan_frecuencia: i.plan_frecuencia,
      fecha_inscripcion: i.fecha_inscripcion,
    })),
    acadInfoMap,
    sesionesPorAcademia,
  );
  const esperadoAcademias = acadFin.total;

  // Clases particulares (individuales sin paquete): cada una se cobra por su precio.
  const { data: clasesPart } = await supabase
    .from("clases")
    .select("id, fecha, precio, valor_facturado")
    .eq("cliente_id", Number(id))
    .eq("tipo", "individual")
    .is("paquete_cliente_id", null)
    .in("estado", ["realizada", "no_show"])
    .order("fecha", { ascending: false });
  const particularesFin = (clasesPart ?? []).map((c) => ({ id: c.id, fecha: c.fecha, valor: c.valor_facturado ?? c.precio ?? 0 }));
  const esperadoParticulares = particularesFin.reduce((s, c) => s + c.valor, 0);

  // Pagos: imputar a academias / paquetes según la etiqueta de servicio; el resto es informativo.
  let pagadoAcademias = 0;
  let pagadoPaquetes = 0;
  let pagadoParticulares = 0;
  const otrosPagos: { servicio: string; periodos: string[]; monto: number; fecha: string }[] = [];
  for (const a of asigns ?? []) {
    const p = pagoById.get(a.pago_id);
    const monto = p?.monto ?? 0;
    const tipo = clasificarServicio(a.servicio);
    if (tipo === "academia") pagadoAcademias += monto;
    else if (tipo === "paquete") pagadoPaquetes += monto;
    else if (tipo === "particular") pagadoParticulares += monto;
    else otrosPagos.push({ servicio: a.servicio, periodos: a.periodos, monto, fecha: p?.fecha ?? "" });
  }
  const saldoAcademias = pagadoAcademias - esperadoAcademias;
  const saldoPaquetes = pagadoPaquetes - esperadoPaquetes;
  const saldoParticulares = pagadoParticulares - esperadoParticulares;
  const hayAcademias = (inscripciones ?? []).length > 0 || pagadoAcademias > 0;
  const hayPaquetes = paquetesFin.length > 0 || pagadoPaquetes > 0;
  const hayParticulares = particularesFin.length > 0 || pagadoParticulares > 0;

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
          <Dato label="Documento" valor={cliente.documento} />
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
        <CardContent className="space-y-5 text-sm">
          {!verFinanzas ? (
            <p className="text-muted-foreground">Visible solo para administración.</p>
          ) : !hayAcademias && !hayPaquetes && !hayParticulares && otrosPagos.length === 0 ? (
            <p className="text-muted-foreground">Sin servicios contratados ni pagos registrados.</p>
          ) : (
            <>
              {hayAcademias && (
                <section className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold">Academias</h3>
                    <SaldoBadge saldo={saldoAcademias} />
                  </div>
                  {acadFin.porAcademia.length > 0 || acadFin.matriculas.length > 0 ? (
                    <ul className="divide-y">
                      {acadFin.porAcademia.map((a) => (
                        <li key={`a${a.academiaId}`} className="flex justify-between gap-3 py-1.5">
                          <span>
                            {acaById.get(a.academiaId) ?? `Academia #${a.academiaId}`}
                            <span className="text-muted-foreground">{" · "}{a.sesiones} clase(s)</span>
                          </span>
                          <span className="text-muted-foreground">{COP.format(a.cargo)}</span>
                        </li>
                      ))}
                      {acadFin.matriculas.map((m) => (
                        <li key={`m${m.deporte}`} className="flex justify-between gap-3 py-1.5">
                          <span>
                            Matrícula <span className="capitalize">{m.deporte}</span>
                            <span className="text-muted-foreground">{" · "}{m.semestres} sem.</span>
                          </span>
                          <span className="text-muted-foreground">{COP.format(m.cargo)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted-foreground">Sin academias activas; hay pagos de academia registrados.</p>
                  )}
                  <p className="text-muted-foreground">
                    Esperado {COP.format(esperadoAcademias)} · Pagado {COP.format(pagadoAcademias)}
                  </p>
                </section>
              )}

              {hayPaquetes && (
                <section className="space-y-2 border-t pt-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold">Paquetes</h3>
                    <SaldoBadge saldo={saldoPaquetes} />
                  </div>
                  {paquetesFin.length > 0 ? (
                    <ul className="divide-y">
                      {paquetesFin.map((p) => (
                        <li key={p.id} className="flex justify-between gap-3 py-1.5">
                          <span>{p.nombre}</span>
                          <span className="text-muted-foreground">{COP.format(p.valor)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted-foreground">Sin paquetes asignados; hay pagos de paquete registrados.</p>
                  )}
                  <p className="text-muted-foreground">
                    Esperado {COP.format(esperadoPaquetes)} · Pagado {COP.format(pagadoPaquetes)}
                  </p>
                </section>
              )}

              {hayParticulares && (
                <section className="space-y-2 border-t pt-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold">Clases particulares</h3>
                    <SaldoBadge saldo={saldoParticulares} />
                  </div>
                  {particularesFin.length > 0 ? (
                    <ul className="divide-y">
                      {particularesFin.map((c) => (
                        <li key={c.id} className="flex justify-between gap-3 py-1.5">
                          <span>Clase particular<span className="text-muted-foreground"> · {c.fecha}</span></span>
                          <span className="text-muted-foreground">{COP.format(c.valor)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted-foreground">Sin clases particulares; hay pagos registrados.</p>
                  )}
                  <p className="text-muted-foreground">
                    Esperado {COP.format(esperadoParticulares)} · Pagado {COP.format(pagadoParticulares)}
                  </p>
                </section>
              )}

              {otrosPagos.length > 0 && (
                <section className="space-y-2 border-t pt-4">
                  <h3 className="font-semibold">
                    Otros pagos{" "}
                    <span className="text-muted-foreground text-xs font-normal">(no afectan el saldo)</span>
                  </h3>
                  <ul className="divide-y">
                    {otrosPagos.map((o, idx) => (
                      <li key={idx} className="flex justify-between gap-3 py-1.5">
                        <span>
                          {o.servicio}
                          {o.periodos.length > 0 && (
                            <span className="text-muted-foreground"> · {o.periodos.join(", ")}</span>
                          )}
                        </span>
                        <span className="text-muted-foreground">
                          {COP.format(o.monto)}{o.fecha ? ` · ${o.fecha}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <p className="border-t pt-3 font-semibold">Total conciliado: {COP.format(totalConciliado)}</p>
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

/** Clasifica un pago por su etiqueta de servicio: solo academias y paquetes generan saldo. */
function clasificarServicio(servicio: string): "academia" | "paquete" | "particular" | "otro" {
  const s = servicio.toLowerCase();
  if (s.startsWith("academia")) return "academia";
  if (s.startsWith("paquete")) return "paquete";
  if (s.includes("clase particular")) return "particular";
  return "otro";
}

/** Badge de saldo: negativo = pendiente (debe), positivo = a favor, cero = al día. */
function SaldoBadge({ saldo }: { saldo: number }) {
  if (saldo < 0) return <Badge variant="destructive">Pendiente {COP.format(-saldo)}</Badge>;
  if (saldo > 0) return <Badge variant="secondary">A favor {COP.format(saldo)}</Badge>;
  return <Badge variant="outline">Al día</Badge>;
}
