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
import { buttonVariants } from "@/components/ui/button";
import { createAdminClient } from "@/lib/supabase/admin";
import { ValorClaseForm } from "./valor-form";
import { EmpleadoDocumentos, type EmpDocItem } from "./empleado-documentos";
import { correoVisible } from "@/lib/empleado";

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

  const admin = createAdminClient();
  const { data: authUser } = await admin.auth.admin.getUserById(id);
  const email = correoVisible(authUser?.user?.email);

  const { data: docsRaw } = await supabase
    .from("empleado_documentos")
    .select("id, tipo, nombre_archivo, storage_path")
    .eq("empleado_id", id)
    .order("created_at", { ascending: false });
  const docs: EmpDocItem[] = await Promise.all(
    (docsRaw ?? []).map(async (d) => {
      const { data: signed } = await supabase.storage.from("empleado-docs").createSignedUrl(d.storage_path, 3600);
      return { ...d, url: signed?.signedUrl ?? null };
    }),
  );

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
  const esAdmin = esSuperadmin || profile.role === "coord_admin";

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href="/empleados" className="text-muted-foreground text-sm hover:underline">
          ← Empleados
        </Link>
        <div className="mt-1 flex items-center justify-between gap-3">
          <h1 className="cdaf-headline">{emp.nombre ?? "Empleado"}</h1>
          {esSuperadmin && (
            <Link href={`/empleados/${emp.id}/editar`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Editar
            </Link>
          )}
        </div>
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
          <div className="col-span-2">
            <p className="text-muted-foreground">Correo electrónico</p>
            <p className="break-all">{email || "Sin correo"}</p>
          </div>
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

      {esAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Documentos</CardTitle>
          </CardHeader>
          <CardContent>
            <EmpleadoDocumentos empleadoId={emp.id} docs={docs} puedeEditar={esAdmin} />
          </CardContent>
        </Card>
      )}

      {emp.role === "profesor" && (
        <Card>
          <CardHeader>
            <CardTitle>Valor por hora</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-2xl font-semibold">
              {valorActual != null ? `${COP.format(valorActual)} / hora` : "Sin definir"}
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
