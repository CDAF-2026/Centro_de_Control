import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { docentesConDeporte, opcionesParaDeporte } from "@/lib/staff";
import { ClaseForm } from "../clase-form";

export default async function NuevaClasePage({
  searchParams,
}: {
  searchParams: Promise<{ profesor?: string }>;
}) {
  await requireRole(rolesForModule("academias", "edit"));
  const { profesor } = await searchParams;
  const docentes = await docentesConDeporte();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/academias" className="text-muted-foreground text-sm hover:underline">← Academias</Link>
        <h1 className="cdaf-headline mt-1">Nueva clase</h1>
        <p className="text-muted-foreground mt-1.5 text-sm">
          Un profesor, un día y una hora. Después le agregas los niños.
        </p>
      </div>
      <div className="ring-foreground/[0.06] bg-card rounded-2xl p-6 shadow-md ring-1">
        <ClaseForm profesores={opcionesParaDeporte(docentes, "tenis")} profesorInicial={profesor ?? ""} />
      </div>
    </div>
  );
}
