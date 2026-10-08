-- La migración anterior no casó el texto (diferencia de bytes en los acentos). Mismo cambio, por
-- expresión regular que no depende de las tildes: se quita la frase final sobre las políticas de
-- la academia del texto de ADULTOS. Solo si nadie lo ha firmado.
update public.consentimiento_version
   set texto = regexp_replace(texto,
         ', as. como declaro conocer las pol.ticas de servicio de la academia y estar de acuerdo con su texto integral\.\s*$',
         '.')
 where codigo = '2026-10-adultos'
   and texto ~ 'academia'
   and not exists (select 1 from public.consentimiento_firma f where f.version_id = consentimiento_version.id);
