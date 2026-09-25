-- El `orden` de las reglas vigentes tenía EMPATES (Graciano 18/25, Jorge 22/26, Sebastián
-- 23/58), porque varias se insertaron a mano por SQL. Con empate, Postgres devuelve las filas
-- en cualquier orden, así que cuál gana dependía de la suerte. Hoy los empates son entre
-- reglas que no se pisan (salario + academia en $0), así que no movió plata, pero la vigencia
-- (20260924160000) compara reglas POR POSICIÓN para saber cuáles no cambiaron, y necesita un
-- orden sin empates. Se renumera 0..n-1 por profesor respetando (orden, id): el mismo orden
-- relativo que ya tenían, solo que sin ambigüedad.
with n as (
  select id, row_number() over (partition by profesor_id order by orden, id) - 1 as nuevo
    from public.profesor_regla
   where activo
)
update public.profesor_regla r
   set orden = n.nuevo
  from n
 where r.id = n.id
   and r.orden <> n.nuevo;
