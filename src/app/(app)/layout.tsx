import { requireProfile } from "@/lib/auth";
import { contarNoLeidas } from "@/lib/notas";
import { AppShell } from "@/components/app-shell/app-shell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile();
  const notasSinLeer = await contarNoLeidas(profile.id);

  return (
    <AppShell
      role={profile.role}
      nombre={profile.nombre ?? "Usuario"}
      perfilId={profile.id}
      notasSinLeer={notasSinLeer}
    >
      {children}
    </AppShell>
  );
}
