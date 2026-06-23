import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { ROLE_LABEL } from "@/lib/roles";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { createAdminClient } from "@/lib/supabase/admin";
import { CompensacionForm, type Comp } from "./compensacion-form";
import { EmpleadoDocumentos, type EmpDocItem } from "./empleado-documentos";
import { correoVisible } from "@/lib/empleado";

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

  const esSuperadmin = profile.role === "superadmin";
  const esAdmin = esSuperadmin || profile.role === "coord_admin";

  let comp: Comp | null = null;
  if (emp.role === "profesor") {
    const { data: c } = await supabase
      .from("profesor_compensacion")
      .select("tipo, pct_clase, salario_fijo, pago_asistencia, comision_quincenal, valor_alumno_academia")
      .eq("profesor_id", id)
      .maybeSingle();
    comp = c ?? null;
  }
  const compDefault: Comp = comp ?? {
    tipo: "por_clase",
    pct_clase: 0,
    salario_fijo: 0,
    pago_asistencia: 0,
    comision_quincenal: 0,
    valor_alumno_academia: 0,
  };

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
            <CardTitle>Compensación</CardTitle>
            <CardDescription>Cómo se le liquida a este profesor.</CardDescription>
          </CardHeader>
          <CardContent>
            {esAdmin ? (
              <CompensacionForm profesorId={emp.id} comp={compDefault} />
            ) : (
              <p className="text-muted-foreground text-sm">Solo administración puede ver o editar la compensación.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
