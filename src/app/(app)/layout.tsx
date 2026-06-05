import { requireProfile } from "@/lib/auth";
import { logout } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import type { AppRole } from "@/lib/database.types";

const ROLE_LABEL: Record<AppRole, string> = {
  superadmin: "Superadministrador",
  coord_admin: "Coord. Administrativo",
  coord_deportivo: "Coord. Deportivo",
  recepcion: "Recepción",
  profesor: "Profesor",
};

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-card flex items-center justify-between border-b px-6 py-3">
        <span className="cdaf-eyebrow">Centro de Control · CDAF</span>
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground text-sm">
            {profile.nombre ?? "Usuario"} · {ROLE_LABEL[profile.role]}
          </span>
          <form action={logout}>
            <Button type="submit" variant="outline" size="sm">
              Salir
            </Button>
          </form>
        </div>
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
