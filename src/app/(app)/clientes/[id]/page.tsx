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
      "id, nombres, apellidos, documento, fecha_nacimiento, es_menor, celular, email, emergencia_nombre, emergencia_celular, emergencia_parentesco, factura_a_nombre, factura_a_nit, deportes, estado, acudiente_id",
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
  const inscripcionesView = (inscripciones ?? []).map((i) => ({
    id: i.id,
    plan_frecuencia: i.plan_frecuencia,
    descuento_pct: i.descuento_pct,
    dias: i.dias,
    academiaNombre: acaById.get(i.academia_id) ?? `Academia #${i.academia_id}`,
  }));

  const { data: pqCli } = await supabase
    .from("paquetes_cliente")
    .select("id, catalogo_id, num_clases, clases_consumidas, estado, descuento_pct, vence_el")
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
  }));

  const { data: catalogoActivo } = await supabase
    .from("paquetes_catalogo")
    .select("id, nombre, num_clases")
    .eq("activo", true)
    .order("num_clases");

  const puedeEditar = can(profile.role, "clientes", "edit");

  // ── Situación financiera: facturado / pagado / saldo desde Siigo (Siigo manda) ──
  const verFinanzas = can(profile.role, "cliente_finanzas");
  let resumenSiigo: { nombre: string; facturado: number; pagado: number; saldo: number }[] = [];
  let facturadoTotal = 0;
  let pagadoTotal = 0;
  if (verFinanzas) {
    const [{ data: resumen }, { data: servicios }] = await Promise.all([
      supabase.rpc("siigo_resumen_cliente", { p_cliente: Number(id) }),
      supabase.from("servicios").select("id, nombre"),
    ]);
    const svName = new Map((servicios ?? []).map((sv) => [sv.id, sv.nombre]));
    resumenSiigo = (resumen ?? [])
      .map((r) => {
        const facturado = Number(r.facturado);
        const pagado = Number(r.pagado);
        return {
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
