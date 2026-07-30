-- ============================================================================
-- 0060 · Mi perfil + control de acceso
--
-- Tres cosas:
--   1. `profiles.avatar_path` + bucket `avatares` para la foto de perfil.
--   2. Política `profiles_update_self`: cada quien edita SU propio perfil.
--      Hasta hoy solo el superadministrador podía escribir en `profiles`
--      (`profiles_update_superadmin`, 0001), así que una página "Mi perfil"
--      para recepción o un profesor no habría podido guardar nada.
--   3. Trigger de blindaje: abrir el punto 2 sin candado dejaría que
--      cualquiera se ascendiera a `superadmin` o se reactivara la cuenta
--      editando su propio perfil. El trigger lo impide en la base, no en la UI.
-- ============================================================================

-- ───────────────────────── 1 · Foto de perfil ─────────────────────────
alter table public.profiles add column if not exists avatar_path text;

comment on column public.profiles.avatar_path is
  'Ruta del archivo en el bucket `avatares` (no la URL). Null = sin foto, se pintan las iniciales.';

-- Bucket PÚBLICO a propósito: el avatar se pinta en el encabezado de todas las
-- pantallas, y una URL firmada habría que renovarla en cada carga y no se puede
-- cachear. Los demás buckets del proyecto (empleado-docs, cliente-docs,
-- evento-docs) siguen privados porque ahí sí hay datos sensibles.
insert into storage.buckets (id, name, public)
values ('avatares', 'avatares', true)
on conflict (id) do nothing;

-- Escribir: solo dentro de la carpeta propia (`<uid>/archivo.jpg`).
-- El superadministrador puede escribir en cualquiera para arreglar una foto.
create policy "avatares_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatares'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or private.user_role() = 'superadmin'
    )
  );

create policy "avatares_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatares'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or private.user_role() = 'superadmin'
    )
  );

create policy "avatares_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatares'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or private.user_role() = 'superadmin'
    )
  );

-- ──────────────── 2 · Cada quien edita su propio perfil ────────────────
create policy "profiles_update_self"
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- ──────────────── 3 · Candado sobre rol y estado de la cuenta ────────────────
-- `role` y `activo` deciden qué ve y si entra: solo los mueve el
-- superadministrador. Va en trigger y no en la política porque una política que
-- compare contra el valor viejo tendría que leer `profiles` dentro de su propia
-- RLS (recursión). El trigger ve `old` y `new` directamente.
--
-- `auth.uid() is null` = cliente service_role (Admin API desde el servidor).
-- Ese camino ya pasó por `requireRole(["superadmin"])` en la server action, así
-- que se deja pasar; el candado es para las escrituras que llegan con sesión.
create or replace function private.profiles_blindar_rol()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null
     and private.user_role() is distinct from 'superadmin' then
    if new.role is distinct from old.role then
      raise exception 'Solo el superadministrador puede cambiar el rol.';
    end if;
    if new.activo is distinct from old.activo then
      raise exception 'Solo el superadministrador puede activar o desactivar una cuenta.';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.profiles_blindar_rol() from public;

create trigger profiles_blindar_rol
  before update on public.profiles
  for each row execute function private.profiles_blindar_rol();
