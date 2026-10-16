-- El CAMBIO a "sin casillas" (Laura y el club, 16-oct-2026), aplicado justo después de desplegar el código
-- que ya no pinta casillas. Se cierran 2026-10-v3 y 2026-10-adultos-v4 (siguen valiendo para sus firmas) y
-- se abren 2026-10-v4 y 2026-10-adultos-v5. Reglamento General y Academias no cambian.
-- Las v3/adultos-v4 se abrieron hoy mismo: se cierran con `vigente_hasta = current_date`; el desempate de
-- `consentimiento_version_vigente` (20261016140000) hace ganar a la que sigue abierta.
update public.consentimiento_version
   set vigente_hasta = current_date
 where vigente_hasta is null
   and vigente_desde is not null
   and publico in ('menores', 'adultos')
   and codigo not in ('2026-10-v4', '2026-10-adultos-v5');

update public.consentimiento_version
   set vigente_desde = current_date
 where codigo in ('2026-10-v4', '2026-10-adultos-v5')
   and vigente_desde is null;
