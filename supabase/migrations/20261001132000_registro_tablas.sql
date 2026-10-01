-- ============================================================================
-- Registro público y consentimiento digital · tablas (Fase 1, 1-oct-2026)
-- ----------------------------------------------------------------------------
-- Primera pantalla pública que escribe en la base. Por eso:
--   · `anon` y `authenticated` NO reciben ningún privilegio en estas tablas:
--     escribe solo el servidor (service_role) y lee el personal por políticas
--     explícitas, con sus dos mitades donde aplica.
--   · La evidencia de una firma (`consentimiento_firma`) no tiene política de
--     UPDATE ni DELETE para nadie con sesión: se anula con motivo, no se borra.
--   · El `payload` de una solicitud trae datos personales: se purga a los 90
--     días de aplicada (`registro_limpiar`, migración de funciones). La firma se
--     conserva siempre: es la prueba.
-- Diseño completo en docs/plan-registro-y-consentimiento-digital.md §4.9.
-- ============================================================================

-- ─────────────── Sesión del recorrido (la cookie apunta aquí) ───────────────
-- Hilvana datos → consentimiento → "¿otro hijo?" sin poner nada en la URL.
create table public.registro_sesion (
  id          uuid primary key default gen_random_uuid(),
  firmante    jsonb,                       -- quien diligencia, para no pedirlo otra vez con el 2º hijo
  miembros    jsonb not null default '[]', -- [{miembro_id, cliente_id, nombre}] ya procesados
  cerrada     boolean not null default false,
  created_at  timestamptz not null default now(),
  expira_el   timestamptz not null default now() + interval '2 hours'
);

-- ─────────────── Lo que llegó, tal cual ───────────────
create table public.registro_solicitud (
  id             uuid primary key default gen_random_uuid(),
  sesion_id      uuid references public.registro_sesion (id) on delete set null,
  tipo           public.registro_tipo not null,
  estado         public.registro_estado not null default 'recibida',
  payload        jsonb,                                  -- PII; se purga al aplicarse + 90 días
  resultado      jsonb,                                  -- {creada, llenados[], candidatos[], ...}
  cliente_id     bigint references public.clientes (id) on delete set null,
  miembro_id     bigint references public.cliente_miembros (id) on delete set null,
  ip_hash        text,
  user_agent     text,
  revisada_por   uuid references auth.users (id) on delete set null,
  revisada_el    timestamptz,
  nota_revision  text,
  created_at     timestamptz not null default now(),
  expira_el      timestamptz not null default now() + interval '48 hours'
);
create index registro_solicitud_estado_idx on public.registro_solicitud (estado, created_at desc);
create index registro_solicitud_cliente_idx on public.registro_solicitud (cliente_id);

-- ─────────────── Facturación distinta a la que había (D1) ───────────────
create table public.registro_cambio (
  id             bigint generated always as identity primary key,
  solicitud_id   uuid not null references public.registro_solicitud (id) on delete cascade,
  cliente_id     bigint not null references public.clientes (id) on delete cascade,
  campo          text not null,            -- factura_a_nombre | factura_a_nit | factura_tipo | factura_email
  valor_actual   text,
  valor_nuevo    text,
  estado         public.cambio_estado not null default 'pendiente',
  decidido_por   uuid references auth.users (id) on delete set null,
  decidido_el    timestamptz,
  created_at     timestamptz not null default now(),
  constraint registro_cambio_campo check (campo in ('factura_a_nombre', 'factura_a_nit', 'factura_tipo', 'factura_email'))
);
create index registro_cambio_pendiente_idx on public.registro_cambio (cliente_id) where estado = 'pendiente';

-- ─────────────── Rate limit por IP ───────────────
create table public.registro_intento (
  id          bigint generated always as identity primary key,
  ip_hash     text not null,
  created_at  timestamptz not null default now()
);
create index registro_intento_ip_idx on public.registro_intento (ip_hash, created_at desc);

-- ─────────────── La evidencia de cada firma. Se conserva siempre. ───────────────
create table public.consentimiento_firma (
  id                   uuid primary key default gen_random_uuid(),
  solicitud_id         uuid references public.registro_solicitud (id) on delete set null,
  sesion_id            uuid references public.registro_sesion (id) on delete set null,
  version_id           bigint not null references public.consentimiento_version (id),
  cliente_id           bigint references public.clientes (id) on delete set null,
  miembro_id           bigint references public.cliente_miembros (id) on delete set null,
  estado               public.firma_estado not null,
  -- Lo que se ESCRIBIÓ al firmar (evidencia; no se corrige aunque la ficha cambie después)
  firmante_nombre      text not null,
  firmante_documento   text not null,
  firmante_parentesco  text,
  firmante_celular     text,
  firmante_email       text,
  menor_nombre         text not null,
  menor_documento      text,
  menor_rh             text,
  eps                  text,
  metodo               public.firma_metodo not null,
  firmado_el           timestamptz not null default now(),   -- hora del SERVIDOR
  ip                   inet,
  user_agent           text,
  firma_png_path       text,                                 -- bucket consentimientos
  pdf_path             text,
  pdf_sha256           text,
  documento_id         bigint references public.cliente_documentos (id) on delete set null,
  anulada_por          uuid references auth.users (id) on delete set null,
  anulada_el           timestamptz,
  motivo_anulacion     text,
  created_at           timestamptz not null default now(),
  constraint consentimiento_firma_asignada check (estado <> 'asignada' or (cliente_id is not null and miembro_id is not null)),
  constraint consentimiento_firma_anulada check (estado <> 'anulada' or motivo_anulacion is not null)
);
create index consentimiento_firma_miembro_idx on public.consentimiento_firma (miembro_id) where estado = 'asignada';
create index consentimiento_firma_cliente_idx on public.consentimiento_firma (cliente_id);
create index consentimiento_firma_pendiente_idx on public.consentimiento_firma (created_at) where estado = 'pendiente_asignar';

comment on table public.consentimiento_firma is
  'Evidencia de cada consentimiento firmado por la página pública: quién, cuándo (servidor), desde dónde, qué versión y la huella del PDF. Nunca se borra; se anula con motivo.';

-- ─────────────── Permisos ───────────────
revoke all on public.registro_sesion, public.registro_solicitud, public.registro_cambio,
                public.registro_intento, public.consentimiento_firma
  from anon, authenticated;

alter table public.registro_sesion      enable row level security;
alter table public.registro_solicitud   enable row level security;
alter table public.registro_cambio      enable row level security;
alter table public.registro_intento     enable row level security;
alter table public.consentimiento_firma enable row level security;

-- Sesiones e intentos: nadie con sesión los ve (solo el servidor).

-- Solicitudes y cambios: los revisores (D8: superadmin y coord. administrativo).
grant select on public.registro_solicitud, public.registro_cambio to authenticated;
create policy "registro_solicitud_select" on public.registro_solicitud
  for select to authenticated
  using (private.user_role() in ('superadmin', 'coord_admin'));
create policy "registro_cambio_select" on public.registro_cambio
  for select to authenticated
  using (private.user_role() in ('superadmin', 'coord_admin'));
-- Decidir (asignar, aprobar, rechazar) va por RPC en la Fase 3; sin UPDATE directo.

-- Firmas: las ve quien ve la ficha del cliente (misma lista que cliente_documentos).
grant select on public.consentimiento_firma to authenticated;
create policy "consentimiento_firma_select" on public.consentimiento_firma
  for select to authenticated
  using (private.user_role() in ('superadmin', 'coord_admin', 'coord_deportivo', 'recepcion', 'gestion_eventos'));
-- Sin política de update/delete a propósito: anular es un RPC solo-SA.
