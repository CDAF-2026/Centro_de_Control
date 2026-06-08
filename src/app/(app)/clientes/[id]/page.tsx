import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { rolesForModule, can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EstadoForm } from "./estado-form";
import { Documentos, type DocItem } from "./documentos";

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
      "id, nombres, apellidos, documento, fecha_nacimiento, es_menor, celular, email, emergencia_nombre, emergencia_celular, emergencia_parentesco, estado, acudiente_id",
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

  const puedeEditar = can(profile.role, "clientes", "edit");

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
          {puedeEditar && <EstadoForm id={cliente.id} estado={cliente.estado} />}
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
        <CardContent className="space-y-2 text-sm">
          {asigns && asigns.length > 0 ? (
            <>
              <ul className="divide-y">
                {asigns.map((a) => {
                  const p = pagoById.get(a.pago_id);
                  return (
                    <li key={a.id} className="flex justify-between gap-3 py-2">
                      <span>
                        {a.servicio}
                        {a.periodos.length > 0 && (
                          <span className="text-muted-foreground"> · {a.periodos.join(", ")}</span>
                        )}
                      </span>
                      <span className="text-muted-foreground">
                        {p ? `${COP.format(p.monto)} · ${p.fecha}` : ""}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="font-semibold">Total conciliado: {COP.format(totalConciliado)}</p>
            </>
          ) : (
            <p className="text-muted-foreground">
              Sin pagos conciliados (visible solo para administración).
            </p>
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
