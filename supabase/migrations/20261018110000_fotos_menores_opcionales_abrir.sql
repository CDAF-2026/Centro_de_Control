-- El CAMBIO a la casilla de fotos para menores (Laura y el club, 18-oct-2026), aplicado justo después de
-- desplegar el código que la pinta y avisa al club. Se cierran 2026-10-v4 y reglamento-2026-10-v3 (siguen
-- valiendo para sus firmas; se abrieron el 16-oct, así que `current_date - 1` no deja rango vacío) y se abren
-- 2026-10-v5 y reglamento-2026-10-v4. Adultos (2026-10-adultos-v5) y Academias no cambian.
update public.consentimiento_version
   set vigente_hasta = current_date - 1
 where vigente_hasta is null
   and vigente_desde is not null
   and publico in ('menores', 'reglamento')
   and codigo not in ('2026-10-v5', 'reglamento-2026-10-v4');

update public.consentimiento_version
   set vigente_desde = current_date
 where codigo in ('2026-10-v5', 'reglamento-2026-10-v4')
   and vigente_desde is null;
