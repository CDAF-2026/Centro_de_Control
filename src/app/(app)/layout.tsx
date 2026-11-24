import { requireProfile } from "@/lib/auth";
import { contarNoLeidas } from "@/lib/notas";
import { avatarUrl } from "@/lib/avatar";
import { AppShell } from "@/components/app-shell/app-shell";
import { rolesForModule } from "@/lib/auth/permissions";
import { MascotaAgente } from "./agente/mascota";

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
      {/* La mascota del Agente CDAF en todas las pantallas, solo para quien tiene el
          agente (hoy, el superadministrador). La ruta valida el rol otra vez. */}
      {rolesForModule("agente_ia").includes(profile.role) && <MascotaAgente />}
    </AppShell>
  );
}
