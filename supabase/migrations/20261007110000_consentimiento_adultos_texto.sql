-- Texto de ADULTOS, párrafo 3 (Laura, 7-oct-2026): "solo debe quedar en nombre propio".
-- El Word del club traía heredado del de menores "en nombre propio y en nombre de mi hijo (a)
-- … mi participación o su participación". Se corrige EN LA MISMA versión porque se abrió hoy y
-- NADIE la ha firmado todavía (el guard lo exige: con firmas habría que crear otra versión). El
-- trigger recalcula la huella.
update public.consentimiento_version
   set texto = replace(replace(texto,
         'asumo en nombre propio y en nombre de mi hijo (a) todos los riesgos asociados con mi participación o su participación',
         'asumo en nombre propio todos los riesgos asociados con mi participación'),
         'y asumo mi responsabilidad', 'y asumo mi responsabilidad')
 where codigo = '2026-10-adultos'
   and not exists (select 1 from public.consentimiento_firma f where f.version_id = consentimiento_version.id);
