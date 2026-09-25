-- "Alianzas colegios" reemplaza a "Convenios colegios" (25-sep-2026, decisión de Laura).
--
-- El 22-sep-2026 el club creó en Siigo el grupo "Alianzas colegios" con tres productos
-- (ALI-001 MONTELUNA TENIS · ALI-002 MONTESSORI TENIS · ALI-003 MONTESSORI PADEL). Ningún
-- servicio lo reclamaba, así que la primera venta (FV-3-18606, $4.020.000) entró como
-- "Sin categoría" en el dashboard. El grupo viejo "CONVENIOS COLEGIOS" (producto AF683
-- "Convenio") nunca tuvo una sola venta.
--
-- Se ACTUALIZA el servicio 14, no se crea otro: es lo mismo con nombre nuevo. El producto
-- viejo AF683 se sigue reclamando por CÓDIGO para que no quede huérfano ni salga en el
-- aviso de /config si algún día se vuelve a usar.

update public.servicios
   set nombre = 'Alianzas colegios',
       siigo_grupo = 'Alianzas colegios',
       siigo_codigos = array['AF683']
 where clave = 'convenios_colegios';

-- Caché de productos: el grupo nuevo y el código viejo.
update public.siigo_productos p
   set servicio_id = s.id
  from public.servicios s
 where s.clave = 'convenios_colegios'
   and (lower(trim(p.account_group)) = 'alianzas colegios' or p.codigo = any (s.siigo_codigos))
   and p.servicio_id is distinct from s.id;

-- Líneas ya sincronizadas (hoy: la de FV-3-18606).
update public.siigo_factura_lineas l
   set servicio_id = p.servicio_id
  from public.siigo_productos p
 where p.codigo = l.codigo
   and p.servicio_id = (select id from public.servicios where clave = 'convenios_colegios')
   and l.servicio_id is distinct from p.servicio_id;
