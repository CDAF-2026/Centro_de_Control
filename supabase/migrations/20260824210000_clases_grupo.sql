-- Una clase de academia dice a qué GRUPO pertenece, no solo a qué academia.
--
-- Sin esto el cierre tiene que adivinar el grupo cruzando día y hora, y si dos
-- grupos coinciden en horario —pasa: el club dicta varios en paralelo en canchas
-- distintas— no hay forma de saber a quién se esperaba.
--
-- Se guarda el GRUPO y no la franja: el cierre casa la franja por día y hora con
-- la tolerancia de ±20 min que ya se usa en todo el módulo, así que guardar las
-- dos cosas solo abriría la puerta a que se contradigan.
--
-- Nullable porque las clases que no son de academia no tienen grupo. Hoy no hay
-- ninguna clase de academia registrada, así que no hay nada que rellenar.
alter table public.clases
  add column if not exists grupo_id bigint references public.academia_grupo(id) on delete set null;

comment on column public.clases.grupo_id is
  'Grupo de academia al que pertenece la clase. Null en clases particulares y de paquete.';

create index if not exists clases_grupo_idx on public.clases (grupo_id) where grupo_id is not null;
