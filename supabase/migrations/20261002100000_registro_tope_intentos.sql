-- Tope de intentos del registro público: 60 / 10 min · 400 / día por IP (2-oct-2026).
--
-- Los 10 / 10 min iniciales bloqueaban al club el día del arranque: todos los papás
-- en el wifi del club salen con la MISMA IP, y cada familia hace dos envíos (datos +
-- firma), así que a la quinta familia los demás veían "Demasiados intentos". El tope
-- sigue existiendo (frena a un robot), pero dimensionado para una recepción llena.
create or replace function public.registro_permitido(p_ip_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_10min int;
  v_dia   int;
begin
  select count(*) filter (where created_at > now() - interval '10 minutes'),
         count(*)
    into v_10min, v_dia
    from public.registro_intento
   where ip_hash = p_ip_hash
     and created_at > now() - interval '24 hours';

  insert into public.registro_intento (ip_hash) values (p_ip_hash);

  return v_10min < 60 and v_dia < 400;
end;
$$;

revoke all on function public.registro_permitido(text) from public, anon, authenticated;
