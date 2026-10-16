-- El CAMBIO a la autorización de fotos obligatoria con un solo chulito (Laura, 16-oct-2026), aplicado
-- justo después de desplegar el código que sabe pintar el bloque "AUTORIZACIÓN".
-- Se cierran las versiones vigentes de menores, adultos y reglamento (siguen valiendo para las firmas
-- que ya tienen) y se abren las tres que `20261016130000` dejó en preparación. Academias no cambia.
-- Las vigentes se abrieron hoy mismo: se cierran con `vigente_hasta = current_date` (no `- 1`) para no
-- violar `vigente_hasta >= vigente_desde`. Una vigente por público (índice único por `publico` donde `vigente_hasta` es null).
update public.consentimiento_version
   set vigente_hasta = current_date
 where vigente_hasta is null
   and vigente_desde is not null
   and publico in ('menores', 'adultos', 'reglamento')
   and codigo not in ('2026-10-v3', '2026-10-adultos-v4', 'reglamento-2026-10-v3');

update public.consentimiento_version
   set vigente_desde = current_date
 where codigo in ('2026-10-v3', '2026-10-adultos-v4', 'reglamento-2026-10-v3')
   and vigente_desde is null;

-- Desempate: la v2 se abrió y se cierra el mismo día (16-oct), así que hoy las dos pasan el filtro de
-- fechas. Gana la que sigue abierta (`vigente_hasta` null); después, la más reciente.
create or replace function public.consentimiento_version_vigente(p_publico text default 'menores')
returns public.consentimiento_version
language sql
stable
security definer
set search_path = ''
as $$
  select v from public.consentimiento_version v
   where v.publico = coalesce(p_publico, 'menores')
     and v.vigente_desde is not null
     and v.vigente_desde <= current_date
     and (v.vigente_hasta is null or v.vigente_hasta >= current_date)
   order by (v.vigente_hasta is null) desc, v.vigente_desde desc, v.id desc
   limit 1;
$$;
revoke all on function public.consentimiento_version_vigente(text) from public, anon;
grant execute on function public.consentimiento_version_vigente(text) to authenticated;
