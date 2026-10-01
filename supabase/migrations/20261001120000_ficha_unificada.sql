-- ============================================================================
-- Ficha unificada con la "FICHA PERSONAL 2026" del club (1-oct-2026, decisión D2
-- del plan de registro y consentimiento digital).
-- ----------------------------------------------------------------------------
-- El papel del club pide padre Y madre por separado, dirección de residencia y
-- lugar de nacimiento. La ficha tenía UN acudiente (`clientes.acudiente_id`) y
-- nada de lo otro. Laura decidió unificar: la ficha gana lo del papel sin
-- perder nada de lo que ya tiene, y la landing pública será un espejo exacto.
--
-- Cómo se modela el segundo acudiente: `acudientes` pasa a colgar de la ficha
-- (`cliente_id`, 1:N) con un `rol` (padre/madre/otro). `clientes.acudiente_id`
-- se CONSERVA y sigue siendo "el principal" — lo usa el CHECK
-- `cliente_menor_requiere_acudiente` y cinco sitios que crean fichas. Un
-- trigger mantiene coherente la pareja (si la ficha apunta a un acudiente, ese
-- acudiente es de esa ficha), igual que 0066 hace con el titular.
--
-- Medido antes de tocar: 160 acudientes · 142 fichas con acudiente · 0
-- acudientes compartidos por dos fichas · 18 huérfanos (ninguna ficha los
-- apunta; única FK a acudientes es clientes.acudiente_id) · parentescos
-- escritos: madre/mamá/mama · padre/papá/papa · "por confirmar".
-- ============================================================================

create type public.acudiente_rol as enum ('padre', 'madre', 'otro');

-- ─────────────── 1) Columnas nuevas ───────────────
alter table public.acudientes
  add column cliente_id bigint references public.clientes (id) on delete cascade,
  add column rol public.acudiente_rol not null default 'otro';

create index acudientes_cliente_idx on public.acudientes (cliente_id);

-- Una ficha tiene a lo sumo UN padre y UNA madre; "otro" (abuela, tío) puede repetirse.
create unique index acudientes_rol_uidx on public.acudientes (cliente_id, rol)
  where rol <> 'otro' and cliente_id is not null;

alter table public.clientes
  add column direccion text,
  add column lugar_nacimiento text;   -- espejo del titular (la ficha manda, ver trigger abajo)

alter table public.cliente_miembros
  add column lugar_nacimiento text;

comment on column public.acudientes.cliente_id is 'Ficha a la que pertenece. El principal es además clientes.acudiente_id.';
comment on column public.acudientes.rol is 'padre | madre | otro. Lo que decide el papel en la familia; `parentesco` queda como texto libre.';
comment on column public.clientes.direccion is 'Dirección de residencia de la familia (FICHA PERSONAL 2026).';

-- ─────────────── 2) Backfill ───────────────
-- Cada acudiente apuntado por una ficha pasa a ser suyo.
update public.acudientes a
   set cliente_id = c.id
  from public.clientes c
 where c.acudiente_id = a.id;

-- El rol sale del parentesco escrito (madre/mamá → madre · padre/papá → padre).
update public.acudientes
   set rol = case
               when parentesco ~* '^\s*ma' then 'madre'::public.acudiente_rol
               when parentesco ~* '^\s*pa' then 'padre'::public.acudiente_rol
               else 'otro'::public.acudiente_rol
             end;

-- Los 18 huérfanos no pertenecen a nadie (quedaron de acudientes reemplazados).
-- Se borran con rastro en audit_log, fila entera, por si alguno hiciera falta.
insert into public.audit_log (actor_id, action, entity, entity_id, before)
select null, 'acudiente.borrar_huerfano', 'acudientes', a.id::text, to_jsonb(a)
  from public.acudientes a
 where a.cliente_id is null;

delete from public.acudientes where cliente_id is null;

-- ─────────────── 3) Coherencia principal ↔ ficha ───────────────
-- Al poner `clientes.acudiente_id`, ese acudiente queda atado a la ficha. Si ya
-- era de OTRA ficha se rechaza: un acudiente es de una sola familia.
create or replace function private.clientes_acudiente_principal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.acudiente_id is not null then
    update public.acudientes
       set cliente_id = new.id
     where id = new.acudiente_id
       and cliente_id is null;

    if not exists (
      select 1 from public.acudientes
       where id = new.acudiente_id and cliente_id = new.id
    ) then
      raise exception 'El acudiente % pertenece a otra ficha', new.acudiente_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists clientes_acudiente_principal on public.clientes;
create trigger clientes_acudiente_principal
  after insert or update of acudiente_id on public.clientes
  for each row execute function private.clientes_acudiente_principal();

-- ─────────────── 4) El espejo del titular copia lugar_nacimiento ───────────────
create or replace function private.clientes_crear_titular()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.cliente_miembros
    (cliente_id, nombres, apellidos, fecha_nacimiento, lugar_nacimiento, documento, tipo_documento, eps, rh, deportes, es_titular)
  values
    (new.id, new.nombres, new.apellidos, new.fecha_nacimiento, new.lugar_nacimiento, new.documento,
     new.tipo_documento, new.eps, new.rh, coalesce(new.deportes, '{}'), true)
  on conflict do nothing;
  return new;
end;
$$;

create or replace function private.clientes_sincronizar_titular()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.cliente_miembros
     set nombres          = new.nombres,
         apellidos        = new.apellidos,
         fecha_nacimiento = new.fecha_nacimiento,
         lugar_nacimiento = new.lugar_nacimiento,
         documento        = new.documento,
         tipo_documento   = new.tipo_documento,
         eps              = new.eps,
         rh               = new.rh,
         deportes         = coalesce(new.deportes, '{}')
   where cliente_id = new.id
     and es_titular;
  return new;
end;
$$;

-- ─────────────── 5) Permisos ───────────────
-- Quitar un segundo acudiente es un DELETE y no había política (ni hacía falta).
-- Mismos roles que insertan. `anon` nunca debió tener nada aquí (0082).
revoke all on public.acudientes from anon;

create policy "acudientes_delete" on public.acudientes
  for delete to authenticated
  using (private.user_role() in ('superadmin', 'coord_admin', 'recepcion', 'gestion_eventos'));
