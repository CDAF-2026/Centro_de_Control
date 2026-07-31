-- ============================================================================
-- 0063 · El texto de una nota solo lo cambia quien la escribió
-- ----------------------------------------------------------------------------
-- Antes, `puedeEditar` era `autor || admin || soy destinatario`, y la política
-- `notas_update` decía lo mismo. Consistente, pero cruzado con la regla del
-- módulo —"nota sin etiquetar = se reparte a TODO el staff activo"— el efecto
-- real era que **cualquiera de los 9 podía reescribir cualquier nota del tablón
-- general**. Detectado en el repaso de permisos previo al despliegue.
--
-- Decisión de Laura (31-jul-2026): una nota solo la edita quien la creó. Si
-- alguien más tiene algo que decir, responde en el hilo de comentarios — que
-- para eso existe y deja rastro de quién dijo qué.
--
-- ⚠️ POR QUÉ UN TRIGGER Y NO APRETAR LA POLÍTICA `notas_update`:
-- resolver y reabrir una nota TAMBIÉN son UPDATE sobre `notas` (mueven `estado`,
-- `resuelta_por`, `resuelta_el`). Si la política se restringe al autor, el
-- destinatario deja de poder resolver lo que se le asignó — que es justo para lo
-- que sirve el tablón. RLS decide por FILA y no distingue columnas; el trigger
-- sí. Mismo patrón que `profiles_blindar_rol` (migración 0060).
--
-- Se blinda también `autor_id`: sin eso, un destinatario podía ponerse como
-- autor (el `with check` de la política lo habría dejado pasar, porque la fila
-- nueva sí cumple `autor_id = auth.uid()`) y quedarse con la nota.
--
-- `auth.uid() is null` = service_role o scripts del servidor: pasan, porque ese
-- camino ya validó el rol antes de llegar aquí.
--
-- Es SECURITY INVOKER (el valor por defecto): solo mira OLD/NEW y `auth.uid()`,
-- no consulta ninguna tabla, así que no necesita permisos prestados. Y se le
-- revoca EXECUTE para que PostgREST no la publique como endpoint — que fue
-- exactamente el problema que arregló la migración 0062.
-- ============================================================================

create or replace function public.notas_solo_autor_edita()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;

  if (
       new.texto      is distinct from old.texto
    or new.prioridad  is distinct from old.prioridad
    or new.para_todos is distinct from old.para_todos
    or new.autor_id   is distinct from old.autor_id
  ) and old.autor_id <> (select auth.uid())
  then
    raise exception 'Solo quien escribió la nota puede editar su contenido.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

revoke all on function public.notas_solo_autor_edita() from public, anon, authenticated;

drop trigger if exists notas_solo_autor_edita_trg on public.notas;
create trigger notas_solo_autor_edita_trg
  before update on public.notas
  for each row execute function public.notas_solo_autor_edita();

comment on function public.notas_solo_autor_edita() is
  'Blinda texto/prioridad/para_todos/autor_id de una nota: solo su autor los cambia. Resolver y reabrir siguen abiertos a los destinatarios (ver migración 0063).';

notify pgrst, 'reload schema';
