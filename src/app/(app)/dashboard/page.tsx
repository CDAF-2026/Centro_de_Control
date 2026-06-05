import { requireProfile } from "@/lib/auth";

export default async function DashboardPage() {
  const profile = await requireProfile();

  return (
    <div className="space-y-2">
      <h1 className="cdaf-headline">Dashboard</h1>
      <p className="text-muted-foreground">
        Hola, {profile.nombre ?? "usuario"}. Rol: <strong>{profile.role}</strong>.
      </p>
      <p className="text-muted-foreground text-sm">
        El contenido por rol (KPIs, próximas clases, pendientes) llega en el Sprint 5.
      </p>
    </div>
  );
}
