-- `grupo_inscritos` nació con la lista plana de inscritos del grupo y quedó
-- reemplazada el mismo día por `grupo_inscritos_por_franja`: la pantalla ahora
-- despliega cada franja para ver quiénes vienen a ESA clase, que es la pregunta
-- operativa real, y mide la asistencia por franja en vez de promediarla.
-- No se deja: nadie la llama y una función muerta invita a usarla.
drop function if exists public.grupo_inscritos(bigint, date, date);
