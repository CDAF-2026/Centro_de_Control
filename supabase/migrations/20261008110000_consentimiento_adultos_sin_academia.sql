-- Texto de ADULTOS, párrafo 10 (Laura, 8-oct-2026): se quita la mención a las políticas de la
-- academia ("…así como declaro conocer las políticas de servicio de la academia y estar de acuerdo
-- con su texto integral."). Sobre la misma versión porque NADIE la ha firmado (el guard lo exige);
-- el trigger recalcula la huella. El texto de menores no se toca.
update public.consentimiento_version
   set texto = replace(texto,
         'por cualquier daño derivado de la práctica de deportes en sus instalaciones, así como declaro conocer las políticas de servicio de la academia y estar de acuerdo con su texto integral.',
         'por cualquier daño derivado de la práctica de deportes en sus instalaciones.')
 where codigo = '2026-10-adultos'
   and not exists (select 1 from public.consentimiento_firma f where f.version_id = consentimiento_version.id);
