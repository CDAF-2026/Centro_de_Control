-- ============================================================================
-- Cafetería: la carta se administra desde el Centro de Control (20-nov-2026)
--
-- Pedido de Laura. La demo de pedidos por QR tenía la carta escrita en el código
-- y no guardaba nada. Ahora:
--   1. `cafeteria_categorias` + `cafeteria_productos`: la carta, con foto y un
--      solo interruptor Disponible / No disponible. Lo no disponible no le
--      aparece al comprador.
--   2. `cafeteria_pedidos`: el historial de lo que se envió a WhatsApp.
--   3. `cafeteria_ajustes`: una sola fila con el WhatsApp de la cafetería.
--   4. Bucket público `cafeteria` para las fotos.
--
-- Quién administra (decisión de Laura): superadministrador, coordinación
-- administrativa y recepción/cafetería.
--
-- La página pública (`/carta`) NO lee estas tablas con la sesión de nadie: lee y
-- escribe desde el servidor con service_role, igual que `/registro`. Por eso
-- `anon` no recibe nada.
-- ============================================================================

-- ───────────────────────────── 1 · La carta ─────────────────────────────
create table public.cafeteria_categorias (
  id         bigint generated always as identity primary key,
  nombre     text not null check (length(trim(nombre)) > 0),
  -- Posición en la carta: menor va primero. Se mueve con las flechas del panel.
  orden      integer not null default 0,
  created_at timestamptz not null default now()
);
create unique index cafeteria_categorias_nombre_uidx
  on public.cafeteria_categorias (lower(trim(nombre)));

create table public.cafeteria_productos (
  id           bigint generated always as identity primary key,
  -- `restrict`: una categoría con productos no se borra; primero se mueven.
  categoria_id bigint not null references public.cafeteria_categorias (id) on delete restrict,
  nombre       text not null check (length(trim(nombre)) > 0),
  descripcion  text,
  -- Pesos colombianos. 0 = "todavía sin precio".
  precio       integer not null default 0 check (precio >= 0),
  -- Variantes que el comprador escoge (Milo: Frío / Caliente). Vacío = sin variantes.
  opciones     text[] not null default '{}',
  -- Ruta dentro del bucket `cafeteria` (no la URL). Null = sin foto.
  foto_path    text,
  disponible   boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- Nadie le ofrece al comprador un producto en $0: para ponerlo disponible hay
  -- que darle precio primero. Va en la base para que ninguna pantalla lo olvide.
  constraint cafeteria_productos_disponible_con_precio check (not disponible or precio > 0)
);
create index cafeteria_productos_categoria_idx on public.cafeteria_productos (categoria_id);

create trigger cafeteria_productos_updated_at
  before update on public.cafeteria_productos
  for each row execute function private.set_updated_at();

comment on column public.cafeteria_productos.disponible is
  'El único interruptor de la carta (Laura, 20-nov-2026). false = no le aparece al comprador.';

-- ───────────────────────────── 2 · Pedidos ─────────────────────────────
-- Se guarda una FOTO del pedido (nombres y precios como estaban), no punteros a
-- productos: borrar o cambiarle el precio a un producto no puede reescribir lo
-- que alguien pidió ayer.
create table public.cafeteria_pedidos (
  id                bigint generated always as identity primary key,
  -- Código corto que viaja en el mensaje de WhatsApp ("el #K7P3").
  codigo            text not null,
  recibido_el       timestamptz not null default now(),
  nombre            text not null,
  zona_id           text not null,
  zona_nombre       text not null,
  detalle_ubicacion text,
  pago              text not null,
  notas             text,
  -- [{ producto_id, nombre, opcion, cantidad, precio, subtotal }]
  lineas            jsonb not null,
  total             integer not null check (total >= 0),
  -- El texto exacto que se le armó a la persona para WhatsApp.
  mensaje           text not null
);
create index cafeteria_pedidos_recibido_idx on public.cafeteria_pedidos (recibido_el desc);

comment on table public.cafeteria_pedidos is
  'Pedidos armados en /carta. Se registran cuando la persona toca "Enviar pedido por WhatsApp": NO prueban que el mensaje se haya enviado dentro de WhatsApp.';

-- ───────────────────────────── 3 · Ajustes ─────────────────────────────
-- Una sola fila (la llave es `true` y no admite otra).
create table public.cafeteria_ajustes (
  id              boolean primary key default true check (id),
  -- Indicativo + número, solo dígitos (Colombia: 57…). Vacío = WhatsApp deja
  -- escoger el contacto, que sirve para probar sin molestar a la cafetería.
  whatsapp        text not null default '' check (whatsapp ~ '^[0-9]{0,15}$'),
  updated_at      timestamptz not null default now(),
  actualizado_por uuid references public.profiles (id) on delete set null
);
insert into public.cafeteria_ajustes default values;

create trigger cafeteria_ajustes_updated_at
  before update on public.cafeteria_ajustes
  for each row execute function private.set_updated_at();

-- ───────────────────────────── Permisos ─────────────────────────────
-- En este proyecto toda tabla nueva nace con todo abierto para anon y
-- authenticated (default privileges). Se cierra y se devuelve solo lo necesario.
revoke all on public.cafeteria_categorias, public.cafeteria_productos,
              public.cafeteria_pedidos, public.cafeteria_ajustes
  from anon, authenticated;

grant select, insert, update, delete on public.cafeteria_categorias, public.cafeteria_productos to authenticated;
-- Los pedidos solo los escribe el servidor (service_role) desde la página pública.
grant select on public.cafeteria_pedidos to authenticated;
grant select, update on public.cafeteria_ajustes to authenticated;

alter table public.cafeteria_categorias enable row level security;
alter table public.cafeteria_productos  enable row level security;
alter table public.cafeteria_pedidos    enable row level security;
alter table public.cafeteria_ajustes    enable row level security;

create policy "cafeteria_categorias_select" on public.cafeteria_categorias for select to authenticated
  using (private.user_role() in ('superadmin', 'coord_admin', 'recepcion'));
create policy "cafeteria_categorias_write" on public.cafeteria_categorias for all to authenticated
  using (private.user_role() in ('superadmin', 'coord_admin', 'recepcion'))
  with check (private.user_role() in ('superadmin', 'coord_admin', 'recepcion'));

create policy "cafeteria_productos_select" on public.cafeteria_productos for select to authenticated
  using (private.user_role() in ('superadmin', 'coord_admin', 'recepcion'));
create policy "cafeteria_productos_write" on public.cafeteria_productos for all to authenticated
  using (private.user_role() in ('superadmin', 'coord_admin', 'recepcion'))
  with check (private.user_role() in ('superadmin', 'coord_admin', 'recepcion'));

create policy "cafeteria_pedidos_select" on public.cafeteria_pedidos for select to authenticated
  using (private.user_role() in ('superadmin', 'coord_admin', 'recepcion'));

create policy "cafeteria_ajustes_select" on public.cafeteria_ajustes for select to authenticated
  using (private.user_role() in ('superadmin', 'coord_admin', 'recepcion'));
-- Cambiar el número a donde llegan los pedidos es más delicado que tocar la
-- carta: un número mal escrito manda los pedidos a un desconocido.
create policy "cafeteria_ajustes_update" on public.cafeteria_ajustes for update to authenticated
  using (private.user_role() in ('superadmin', 'coord_admin'))
  with check (private.user_role() in ('superadmin', 'coord_admin'));

-- ───────────────────────────── 4 · Fotos ─────────────────────────────
-- Bucket PÚBLICO a propósito, como `avatares`: las fotos las ve cualquiera que
-- abra la carta y no hay nada sensible en ellas. Con tope y tipos propios para
-- que no sirva de depósito de otra cosa.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cafeteria', 'cafeteria', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Leer por la API (no por la URL pública, que no pasa por aquí): reemplazar y
-- borrar una foto necesitan ver la fila del archivo.
create policy "cafeteria_fotos_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'cafeteria' and private.user_role() in ('superadmin', 'coord_admin', 'recepcion'));

create policy "cafeteria_fotos_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'cafeteria' and private.user_role() in ('superadmin', 'coord_admin', 'recepcion'));

create policy "cafeteria_fotos_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'cafeteria' and private.user_role() in ('superadmin', 'coord_admin', 'recepcion'))
  with check (bucket_id = 'cafeteria' and private.user_role() in ('superadmin', 'coord_admin', 'recepcion'));

create policy "cafeteria_fotos_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'cafeteria' and private.user_role() in ('superadmin', 'coord_admin', 'recepcion'));
