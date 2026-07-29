-- `plan_frecuencia` quedó en desuso con el modelo de horarios por inscrito: la
-- frecuencia ya no se declara, se cuenta (un niño con 3 horarios va 3 veces por
-- semana, y eso no se puede contradecir). Era NOT NULL, así que obligaba a
-- inventar un valor en cada inscripción nueva.
--
-- No se borra la columna para no romper nada que todavía la lea; se libera.
alter table public.inscripciones
  alter column plan_frecuencia drop not null,
  alter column plan_frecuencia drop default;
