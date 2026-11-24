-- ═══════════════════════════════════════════════════════════════════════════
-- Agente IA · Fase 1, paso 1 (24-nov-2026): conversaciones guardadas.
-- Plan: docs/plan-agente-ia-fase1.md
--
-- Decisiones de Laura (24-nov-2026):
--   · Lo usa solo el superadministrador.
--   · Cada superadministrador ve SOLO sus conversaciones.
--
-- Escribe SOLO el servidor (service_role), después de validar el rol en la ruta.
-- Por eso no hay políticas de escritura, y además se le quitan a anon y
-- authenticated los privilegios que el proyecto regala a toda tabla nueva del
-- esquema público (handoff §7: "no dar grants NO cierra nada").
-- ═══════════════════════════════════════════════════════════════════════════

create table public.agente_conversacion (
  id          bigint generated always as identity primary key,
  perfil_id   uuid not null references public.profiles(id) on delete cascade,
  titulo      text not null default 'Nueva conversación'
              check (length(btrim(titulo)) between 1 and 200),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index agente_conversacion_perfil_idx
  on public.agente_conversacion (perfil_id, updated_at desc);

-- Un mensaje es la pregunta o la respuesta. `herramientas` guarda qué consultó
-- el agente para responder (nombre, argumentos, fuente y periodo): de ahí sale
-- "Cómo lo calculé" en pantalla. Tokens y costo quedan por mensaje para medir
-- el gasto real del mes de prueba.
create table public.agente_mensaje (
  id               bigint generated always as identity primary key,
  conversacion_id  bigint not null references public.agente_conversacion(id) on delete cascade,
  rol              text not null check (rol in ('usuario', 'agente')),
  contenido        text not null,
  herramientas     jsonb not null default '[]'::jsonb,
  modelo           text,
  tokens_entrada   integer check (tokens_entrada >= 0),
  tokens_cache     integer check (tokens_cache >= 0),
  tokens_salida    integer check (tokens_salida >= 0),
  costo_usd        numeric(12, 6) check (costo_usd >= 0),
  created_at       timestamptz not null default now()
);

create index agente_mensaje_conversacion_idx
  on public.agente_mensaje (conversacion_id, id);

alter table public.agente_conversacion enable row level security;
alter table public.agente_mensaje enable row level security;

revoke all on public.agente_conversacion, public.agente_mensaje from anon, authenticated;
grant select on public.agente_conversacion, public.agente_mensaje to authenticated;

-- Leer: el dueño, y solo si sigue siendo superadministrador.
create policy agente_conversacion_select on public.agente_conversacion
  for select to authenticated
  using (
    perfil_id = (select auth.uid())
    and coalesce((select private.user_role())::text, '') = 'superadmin'
  );

create policy agente_mensaje_select on public.agente_mensaje
  for select to authenticated
  using (
    exists (
      select 1 from public.agente_conversacion c
      where c.id = conversacion_id and c.perfil_id = (select auth.uid())
    )
    and coalesce((select private.user_role())::text, '') = 'superadmin'
  );
