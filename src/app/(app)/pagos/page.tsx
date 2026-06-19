import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { DemoButton } from "./demo-button";
import { PagoManualForm } from "./pago-manual-form";
import { AsignarForm } from "./asignar-form";
import { EmptyState } from "@/components/ui/empty-state";
import { Wallet } from "lucide-react";

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const CENTRO_LABEL: Record<string, string> = {
  clase_particular: "Clase particular",
  cafeteria: "Cafetería",
  academia_tenis: "Academia tenis",
  academia_padel: "Academia pádel",
  otro: "Otro",
};

export default async function PagosPage() {
  await requireRole(rolesForModule("bolsa_pagos"));
  const supabase = await createClient();

  const { data: sinAsignar } = await supabase
    .from("pagos")
    .select("id, monto, fecha, centro_costos, concepto, origen")
    .eq("estado", "sin_asignar")
    .order("fecha", { ascending: false });

  const { data: asignados } = await supabase
    .from("pagos")
    .select("id, monto, fecha, centro_costos, concepto")
    .eq("estado", "asignado")
    .order("fecha", { ascending: false })
    .limit(20);

  const { data: clientes } = await supabase
    .from("clientes")
    .select("id, nombres, apellidos")
    .eq("estado", "activo")
    .order("apellidos");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="cdaf-headline">Bolsa de pagos</h1>
        <DemoButton />
      </div>
      <p className="text-muted-foreground text-sm">
        Demo de la conciliación. La integración real con Siigo se conectará cuando estén las
        credenciales; por ahora puedes importar pagos demo o agregarlos manualmente.
      </p>

      <section className="space-y-3">
        <h2 className="cdaf-title">Por conciliar ({sinAsignar?.length ?? 0})</h2>
        <div className="space-y-2">
          {(sinAsignar ?? []).map((p) => (
            <div key={p.id} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-semibold">{COP.format(p.monto)}</span>{" "}
                  <Badge variant="outline">{CENTRO_LABEL[p.centro_costos]}</Badge>{" "}
                  <span className="text-muted-foreground text-sm">
                    {p.fecha} · {p.concepto ?? ""}
                  </span>
                </div>
              </div>
              <div className="mt-2">
                <AsignarForm pagoId={p.id} clientes={clientes ?? []} />
              </div>
            </div>
          ))}
          {(!sinAsignar || sinAsignar.length === 0) && (
            <EmptyState icon={Wallet} title="No hay pagos por conciliar" description="Importa pagos o agrega uno manual." />
          )}
        </div>
      </section>

      <section className="max-w-3xl space-y-3 border-t pt-6">
        <h2 className="cdaf-title">Agregar pago manual</h2>
        <PagoManualForm />
      </section>

      {(asignados ?? []).length > 0 && (
        <section className="space-y-3 border-t pt-6">
          <h2 className="cdaf-title">Conciliados (últimos)</h2>
          <div className="cdaf-table-wrap">
            <table className="cdaf-table">
              <thead>
                <tr>
                  <th className="px-4 py-2">Fecha</th>
                  <th className="px-4 py-2">Centro</th>
                  <th className="px-4 py-2 text-right">Monto</th>
                  <th className="px-4 py-2">Concepto</th>
                </tr>
              </thead>
              <tbody>
                {(asignados ?? []).map((p) => (
                  <tr key={p.id} className="border-t">
                    <td className="px-4 py-2">{p.fecha}</td>
                    <td className="px-4 py-2">{CENTRO_LABEL[p.centro_costos]}</td>
                    <td className="px-4 py-2 text-right">{COP.format(p.monto)}</td>
                    <td className="px-4 py-2">{p.concepto ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
