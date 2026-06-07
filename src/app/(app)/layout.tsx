import { requireProfile } from "@/lib/auth";
import { AppShell } from "@/components/app-shell/app-shell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile();

  return (
    <AppShell role={profile.role} nombre={profile.nombre ?? "Usuario"}>
      {children}
    </AppShell>
  );
}
