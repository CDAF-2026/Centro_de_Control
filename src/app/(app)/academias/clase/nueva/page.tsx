import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { docentesConDeporte, opcionesParaDeporte } from "@/lib/staff";
import { ClaseForm } from "../clase-form";
import { deporteDe, DEPORTE_NOMBRE } from "../../ui";

export default async function NuevaClasePage({
  searchParams,
}: {
  searchParams: Promise<{ profesor?: string; deporte?: string }>;
}) {
  await requireRole(rolesForModule("academias", "edit"));
  const { profesor, deporte: dep } = await searchParams;
  const deporte = deporteDe(dep);
  const docentes = await docentesConDeporte();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href={deporte === "padel" ? "/academias?deporte=padel" : "/academias"} className="text-muted-foreground text-sm hover:underline">← Academias</Link>
        <h1 className="cdaf-headline mt-1">Nueva clase de {DEPORTE_NOMBRE[deporte].toLowerCase()}</h1>
        <p className="text-muted-foreground mt-1.5 text-sm">
          Un profesor, un día y una hora. Después le agregas los niños.
        </p>
      </div>
      <div className="ring-foreground/[0.06] bg-card rounded-2xl p-6 shadow-md ring-1">
        <ClaseForm
          profesores={opcionesParaDeporte(docentes, deporte)}
          deporte={deporte}
          profesorInicial={profesor ?? ""}
        />
      </div>
    </div>
  );
}
