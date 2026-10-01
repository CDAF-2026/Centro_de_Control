-- El Word del club traía "AALEJANDRO" en el título; Laura confirmó que es ALEJANDRO (1-oct-2026).
-- Se corrige la versión 2026-10 (aún cerrada, nadie ha firmado con ella). El texto no cambia,
-- así que la huella (que sella solo `texto`) tampoco.
update public.consentimiento_version
   set titulo = replace(titulo, 'AALEJANDRO', 'ALEJANDRO')
 where codigo = '2026-10';
