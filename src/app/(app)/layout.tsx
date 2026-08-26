import { requireProfile } from "@/lib/auth";
import { contarNoLeidas } from "@/lib/notas";
import { avatarUrl } from "@/lib/avatar";
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
      avatarUrl={avatarUrl(profile.avatar_path)}
      notasSinLeer={notasSinLeer}
      marcaTurno={profile.marca_turno}
    >
      {children}
    </AppShell>
  );
}
