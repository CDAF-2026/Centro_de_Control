-- El texto de adultos YA tiene una firma real (Daniela Parra Dunoyer, 8-oct-2026 07:58), así que
-- no se edita: se cierra `2026-10-adultos` (sigue valiendo para esa firma) y entra
-- `2026-10-adultos-v2` sin la frase final sobre las políticas de la academia (Laura, 8-oct-2026).
-- Las dos migraciones anteriores (110000 y 111000) no cambiaron nada por el guard de "sin firmas".
update public.consentimiento_version
   set vigente_hasta = current_date - 1
 where codigo = '2026-10-adultos' and vigente_hasta is null;

insert into public.consentimiento_version (codigo, publico, titulo, texto, texto_sha256, vigente_desde)
select '2026-10-adultos-v2', 'adultos', titulo,
       regexp_replace(texto,
         ', as. como declaro conocer las pol.ticas de servicio de la academia y estar de acuerdo con su texto integral\.\s*$',
         '.'),
       '', current_date
  from public.consentimiento_version
 where codigo = '2026-10-adultos';
