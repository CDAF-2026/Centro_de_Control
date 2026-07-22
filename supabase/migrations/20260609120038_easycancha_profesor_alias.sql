-- ============================================================================
-- 0038 · Alias de profesor de EasyCancha → perfil canónico (unificar duplicados)
-- ============================================================================
-- EasyCancha nombra las canchas del mismo profe de varias formas ("Profesor
-- Willinton", "Entrenador  Willinton", "/ Profesor Willinton - Cancha 4"…), lo
-- que lo parte en varias personas en el calendario. Esta tabla mapea el nombre
-- NORMALIZADO (minúsculas, sin acentos, sin la palabra profesor/entrenador) a
-- un único perfil, para mostrarlo como una sola persona.

create table public.easycancha_profesor_alias (
  clave       text primary key,  -- nombre normalizado (ver claveProfesor() en easycancha/client.ts)
  profesor_id uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now()
);
comment on table public.easycancha_profesor_alias is
  'Mapea el nombre normalizado del courtName de EasyCancha a un perfil, para unificar duplicados.';

grant select, insert, update, delete on public.easycancha_profesor_alias to authenticated;
alter table public.easycancha_profesor_alias enable row level security;

-- Leer: cualquier usuario del staff (el calendario lo consultan todos). Escribir: SA/CA.
create policy "ec_alias_select" on public.easycancha_profesor_alias for select to authenticated using (true);
create policy "ec_alias_write" on public.easycancha_profesor_alias for all to authenticated
  using (private.user_role() in ('superadmin', 'coord_admin'))
  with check (private.user_role() in ('superadmin', 'coord_admin'));

-- Willington: las variantes "Profesor/Entrenador Willinton" normalizan a "willinton".
insert into public.easycancha_profesor_alias (clave, profesor_id)
values ('willinton', '966a6025-df58-463d-b5f5-b8cf15aa2c5c')
on conflict (clave) do nothing;
