-- El club estandarizó los nombres de los grupos de producto de academia en Siigo
-- (30-jul-2026). Los nombres viejos YA NO EXISTEN allá, y el sync casa las líneas
-- de factura por ese nombre, así que sin este cambio toda la plata de academia
-- entraría sin categoría en cuanto Siigo cargue facturación nueva.
--
-- Verificado contra la API de Siigo (483 productos, 19 grupos) el 30-jul-2026:
--   "Academia recreativa tenis"   10 productos   (antes "Academia de Tenis ")
--   "Academia competencia tenis"   7 productos   (antes "Alto rendimiento tenis")
--   "Academia recreativa padel"   19 productos   (antes "Academia de Padel")
--   "Academia competencia padel"   1 producto    (antes "Academia Alto Rendimiento Padel")
--   "Alto rendimiento Joaquin"     1 producto    ← NO cambió, se deja igual
--   "Preparación física"           1 producto    ← NO cambió, se deja igual
--
-- Se ACTUALIZAN las filas existentes en vez de crear nuevas, a propósito: sus ids
-- están referenciados por `siigo_factura_lineas.servicio_id` (293 líneas de
-- historia), por `academias.servicio_id` (las 4 academias) y por
-- `profesor_regla.servicio_id` (la comisión del 25% de alto rendimiento pádel de
-- Joaquín y Leo). Crear servicios nuevos partiría la historia en dos y dejaría las
-- reglas de nómina apuntando a un servicio que ya no recibe facturas.
--
-- El match del sync hace trim + lowercase, así que las mayúsculas no importan;
-- se guarda el nombre tal como lo devuelve Siigo para que comparar a ojo sea fácil.

update public.servicios set siigo_grupo = 'Academia recreativa tenis',
                            nombre      = 'Academia Recreativa Tenis'
where clave = 'academia_tenis';

update public.servicios set siigo_grupo = 'Academia competencia tenis',
                            nombre      = 'Academia Competencia Tenis'
where clave = 'alto_rendimiento_tenis';

update public.servicios set siigo_grupo = 'Academia recreativa padel',
                            nombre      = 'Academia Recreativa Pádel'
where clave = 'academia_padel';

update public.servicios set siigo_grupo = 'Academia competencia padel',
                            nombre      = 'Academia Competencia Pádel'
where clave = 'alto_rendimiento_padel';
