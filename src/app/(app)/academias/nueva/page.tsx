import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { profesoresActivos } from "@/lib/staff";
import { AcademiaForm } from "./academia-form";

export default async function NuevaAcademiaPage() {
  await requireRole(["superadmin", "coord_admin", "coord_deportivo"]);
  const profesores = await profesoresActivos();

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <Link href="/academias" className="text-muted-foreground text-sm hover:underline">
          ← Academias
        </Link>
        <h1 className="cdaf-headline mt-1">Nueva academia</h1>
      </div>
      <AcademiaForm profesores={profesores ?? []} />
    </div>
  );
}
