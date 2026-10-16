-- El CAMBIO a los documentos definitivos del abogado (Laura, 16-oct-2026), aplicado justo después de
-- desplegar el código que los sabe pintar (autorizaciones SÍ/NO, casilla de academias).
-- Se cierran las versiones vigentes (siguen valiendo para las firmas que ya tienen) y se abren las
-- cuatro que `20261016100000` dejó en preparación. Una vigente por público (índice único por `publico`).
update public.consentimiento_version
   set vigente_hasta = current_date - 1
 where vigente_hasta is null
   and vigente_desde is not null
   and publico in ('menores', 'adultos', 'reglamento')
   and codigo not in ('2026-10-v2', '2026-10-adultos-v3', 'reglamento-2026-10-v2');

update public.consentimiento_version
   set vigente_desde = current_date
 where codigo in ('2026-10-v2', '2026-10-adultos-v3', 'reglamento-2026-10-v2', 'academias-2026-10')
   and vigente_desde is null;
