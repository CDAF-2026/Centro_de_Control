import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { correoVisible } from "@/lib/empleado";
import { avatarUrl } from "@/lib/avatar";
import { ROLE_LABEL } from "@/lib/roles";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FotoPerfil } from "./foto-perfil";
import { DatosForm } from "./datos-form";
import { CorreoForm } from "./correo-form";
import { PasswordForm } from "./password-form";

export const metadata = { title: "Mi perfil" };

export default async function PerfilPage() {
  const perfil = await requireProfile();

  // El correo vive en Auth, no en `profiles`.
  const admin = createAdminClient();
  const { data: u } = await admin.auth.admin.getUserById(perfil.id);
  const correo = correoVisible(u?.user?.email);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="cdaf-headline">Mi perfil</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Tus datos y la forma en que entras al Centro de Control.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Foto y rol</CardTitle>
          <CardDescription>
            La foto aparece arriba a la derecha en todas las pantallas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FotoPerfil
            nombre={perfil.nombre ?? "Usuario"}
            url={avatarUrl(perfil.avatar_path)}
          />
          <div className="flex flex-wrap items-center gap-2 border-t pt-4 text-sm">
            <span className="text-muted-foreground">Tu rol:</span>
            <Badge variant="secondary">{ROLE_LABEL[perfil.role]}</Badge>
            <span className="text-muted-foreground text-xs">
              Define qué puedes ver; solo lo cambia el superadministrador.
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Datos</CardTitle>
          <CardDescription>Así te ve el resto del equipo en la plataforma.</CardDescription>
        </CardHeader>
        <CardContent>
          <DatosForm nombre={perfil.nombre ?? ""} telefono={perfil.telefono ?? ""} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Correo electrónico</CardTitle>
          <CardDescription>Es el correo con el que inicias sesión.</CardDescription>
        </CardHeader>
        <CardContent>
          <CorreoForm actual={correo} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contraseña</CardTitle>
          <CardDescription>
            Si la olvidas, el superadministrador puede asignarte una nueva.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
