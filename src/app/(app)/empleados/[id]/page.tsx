import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { ROLE_LABEL } from "@/lib/roles";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ValorClaseForm } from "./valor-form";

const COP = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

export default async function EmpleadoDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await requireRole(rolesForModule("empleados"));
  const { id } = await params;

  const supabase = await createClient();
  const { data: emp } = await supabase
    .from("profiles")
    .select("id, nombre, documento, telefono, role, activo")
    .eq("id", id)
    .single();
  if (!emp) notFound();

  let historial: { valor: number; vigente_desde: string }[] = [];
  if (emp.role === "profesor") {
    const { data } = await supabase
      .from("profesor_valor_clase")
      .select("valor, vigente_desde")
      .eq("profesor_id", id)
      .order("vigente_desde", { ascending: false });
    historial = data ?? [];
  }
  const valorActual = historial[0]?.valor ?? null;
  const esSuperadmin = profile.role === "superadmin";

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href="/empleados" className="text-muted-foreground text-sm hover:underline">
          ← Empleados
        </Link>
        <h1 className="cdaf-headline mt-1">{emp.nombre ?? "Empleado"}</h1>
        <div className="mt-2 flex items-center gap-2">
          <Badge variant="secondary">{ROLE_LABEL[emp.role]}</Badge>
          {emp.activo ? (
            <Badge variant="outline">Activo</Badge>
          ) : (
            <Badge variant="destructive">Inactivo</Badge>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Datos</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Documento</p>
            <p>{emp.documento ?? "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Teléfono</p>
            <p>{emp.telefono ?? "—"}</p>
          </div>
        </CardContent>
      </Card>

      {emp.role === "profesor" && (
        <Card>
          <CardHeader>
            <CardTitle>Valor de clase</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-2xl font-semibold">
              {valorActual != null ? COP.format(valorActual) : "Sin definir"}
            </p>

            {esSuperadmin && <ValorClaseForm profesorId={emp.id} />}

            {historial.length > 0 && (
              <div>
                <p className="text-muted-foreground mb-1 text-sm">Historial</p>
                <ul className="text-sm">
                  {historial.map((h, i) => (
                    <li key={i} className="flex justify-between border-b py-1 last:border-0">
                      <span>{COP.format(h.valor)}</span>
                      <span className="text-muted-foreground">desde {h.vigente_desde}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
