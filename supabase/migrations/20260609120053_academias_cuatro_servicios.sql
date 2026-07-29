-- Academias: de "un grupo por horario" a 4 servicios fijos.
--
-- El modelo viejo mezclaba tres cosas en una tabla: el servicio que se cobra, el
-- grupo (día + hora + profesor + cancha) y la inscripción. Por eso se llenó de
-- "grupitos": Esteban tenía 11 academias y Jorge 9, para lo que en realidad son
-- 2 servicios. Decidido con el club el 29-jul-2026.
--
-- Ahora son 4: recreativa/competencia × tenis/pádel. El horario, el profesor y la
-- cancha bajan al horario de cada inscrito (un niño puede ir martes 16:30 con
-- Jorge y sábado 12:00 con Graciano — antes eso era imposible de representar sin
-- duplicar el grupo y el niño). Las columnas dias_semana/hora_inicio/hora_fin/
-- cancha/profesor_id/nivel se quedan en la tabla pero SIN USO, para no romper
-- nada mientras se construye el modelo de horarios por inscrito.
--
-- Y la plata sale de Siigo, no de un precio interno: cada academia apunta a su
-- grupo de producto. `precio`/`matricula` quedan como referencia informativa.

alter table public.academias
  add column if not exists categoria text
    check (categoria in ('recreativa', 'competencia')),
  add column if not exists servicio_id bigint references public.servicios(id);

comment on column public.academias.categoria is 'recreativa | competencia';
comment on column public.academias.servicio_id is
  'Servicio de Siigo con el que se factura esta academia. El ingreso sale de ahí, NO de `precio`.';

-- Las 4 fijas, cada una atada a su grupo de producto de Siigo.
insert into public.academias (codigo, nombre, deporte, categoria, servicio_id, activa, precio, matricula)
select v.codigo, v.nombre, v.deporte::public.deporte, v.categoria, s.id, true, 0, 0
from (values
  ('ACA-2026-TEN-REC', 'Academia Recreativa Tenis',  'tenis', 'recreativa',  'academia_tenis'),
  ('ACA-2026-TEN-COM', 'Academia Competencia Tenis', 'tenis', 'competencia', 'alto_rendimiento_tenis'),
  ('ACA-2026-PAD-REC', 'Academia Recreativa Pádel',  'padel', 'recreativa',  'academia_padel'),
  ('ACA-2026-PAD-COM', 'Academia Competencia Pádel', 'padel', 'competencia', 'alto_rendimiento_padel')
) as v(codigo, nombre, deporte, categoria, servicio_clave)
join public.servicios s on s.clave = v.servicio_clave
where not exists (select 1 from public.academias a where a.codigo = v.codigo);

-- Fuera los grupitos del modelo anterior: quedan identificados por no tener
-- categoría. Se van en cascada sus clases e inscripciones; no hay nada que
-- perder — de las 11, solo una tenía 1 inscrito y 46 clases, todas con 0
-- asistencias registradas y ninguna cerrada.
delete from public.academias where categoria is null;
