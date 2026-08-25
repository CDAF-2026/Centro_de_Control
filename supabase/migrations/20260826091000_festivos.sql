-- ============================================================================
-- 0079 · Calendario de festivos de Colombia
-- ----------------------------------------------------------------------------
-- Hace falta para clasificar las horas: un festivo se paga igual que un domingo
-- (recargo del 90% desde el 1-jul-2026, Ley 2466 de 2025). Sin esta tabla, quien
-- trabaje el 8 de diciembre quedaría contado como si fuera un martes cualquiera.
--
-- Las fechas van ESCRITAS, no calculadas al vuelo, a propósito: doce de los
-- dieciocho dependen de la Pascua o de la Ley Emiliani (que corre siete de ellos
-- al lunes siguiente), y una fórmula metida dentro del cálculo de nómina sería
-- imposible de auditar de un vistazo. Así se revisan con el ojo contra cualquier
-- calendario. Salieron de scripts/festivos-colombia.mjs, que sí trae la fórmula.
--
-- ⚠️ No siempre son 18: en 2030 hay 17, porque el 29 de junio cae sábado y San
-- Pedro se corre al lunes 1 de julio, que es justo el día del Sagrado Corazón
-- (Pascua + 71). Ese choque tumbó la primera versión de esta migración con
-- "duplicate key value violates festivo_pkey". El generador ahora fusiona los
-- dos nombres en un solo día, que es lo que de verdad ocurre.
--
-- ⚠️ Van hasta 2032. Cuando se acabe, el cálculo NO falla: simplemente deja de
-- reconocer los festivos y esas horas se pagan como día normal, en silencio. Hay
-- que volver a correr el generador antes de que se agoten.
-- ============================================================================

create table public.festivo (
  fecha  date primary key,
  nombre text not null
);

comment on table public.festivo is
  'Festivos de Colombia. Se pagan como dominicales (recargo del 90%). Cargados hasta 2032.';

grant select on public.festivo to authenticated;
alter table public.festivo enable row level security;

-- Lo ve todo el staff: no es dato sensible y el cálculo de horas lo consulta con
-- la sesión de quien pide el reporte (incluido el empleado viendo lo suyo).
create policy "festivo_select" on public.festivo
  for select to authenticated using (true);

insert into public.festivo (fecha, nombre) values
  ('2026-01-01', 'Año Nuevo'),
  ('2026-01-12', 'Reyes Magos'),
  ('2026-03-23', 'San José'),
  ('2026-04-02', 'Jueves Santo'),
  ('2026-04-03', 'Viernes Santo'),
  ('2026-05-01', 'Día del Trabajo'),
  ('2026-05-18', 'Ascensión del Señor'),
  ('2026-06-08', 'Corpus Christi'),
  ('2026-06-15', 'Sagrado Corazón'),
  ('2026-06-29', 'San Pedro y San Pablo'),
  ('2026-07-20', 'Independencia'),
  ('2026-08-07', 'Batalla de Boyacá'),
  ('2026-08-17', 'Asunción de la Virgen'),
  ('2026-10-12', 'Día de la Raza'),
  ('2026-11-02', 'Todos los Santos'),
  ('2026-11-16', 'Independencia de Cartagena'),
  ('2026-12-08', 'Inmaculada Concepción'),
  ('2026-12-25', 'Navidad'),
  ('2027-01-01', 'Año Nuevo'),
  ('2027-01-11', 'Reyes Magos'),
  ('2027-03-22', 'San José'),
  ('2027-03-25', 'Jueves Santo'),
  ('2027-03-26', 'Viernes Santo'),
  ('2027-05-01', 'Día del Trabajo'),
  ('2027-05-10', 'Ascensión del Señor'),
  ('2027-05-31', 'Corpus Christi'),
  ('2027-06-07', 'Sagrado Corazón'),
  ('2027-07-05', 'San Pedro y San Pablo'),
  ('2027-07-20', 'Independencia'),
  ('2027-08-07', 'Batalla de Boyacá'),
  ('2027-08-16', 'Asunción de la Virgen'),
  ('2027-10-18', 'Día de la Raza'),
  ('2027-11-01', 'Todos los Santos'),
  ('2027-11-15', 'Independencia de Cartagena'),
  ('2027-12-08', 'Inmaculada Concepción'),
  ('2027-12-25', 'Navidad'),
  ('2028-01-01', 'Año Nuevo'),
  ('2028-01-10', 'Reyes Magos'),
  ('2028-03-20', 'San José'),
  ('2028-04-13', 'Jueves Santo'),
  ('2028-04-14', 'Viernes Santo'),
  ('2028-05-01', 'Día del Trabajo'),
  ('2028-05-29', 'Ascensión del Señor'),
  ('2028-06-19', 'Corpus Christi'),
  ('2028-06-26', 'Sagrado Corazón'),
  ('2028-07-03', 'San Pedro y San Pablo'),
  ('2028-07-20', 'Independencia'),
  ('2028-08-07', 'Batalla de Boyacá'),
  ('2028-08-21', 'Asunción de la Virgen'),
  ('2028-10-16', 'Día de la Raza'),
  ('2028-11-06', 'Todos los Santos'),
  ('2028-11-13', 'Independencia de Cartagena'),
  ('2028-12-08', 'Inmaculada Concepción'),
  ('2028-12-25', 'Navidad'),
  ('2029-01-01', 'Año Nuevo'),
  ('2029-01-08', 'Reyes Magos'),
  ('2029-03-19', 'San José'),
  ('2029-03-29', 'Jueves Santo'),
  ('2029-03-30', 'Viernes Santo'),
  ('2029-05-01', 'Día del Trabajo'),
  ('2029-05-14', 'Ascensión del Señor'),
  ('2029-06-04', 'Corpus Christi'),
  ('2029-06-11', 'Sagrado Corazón'),
  ('2029-07-02', 'San Pedro y San Pablo'),
  ('2029-07-20', 'Independencia'),
  ('2029-08-07', 'Batalla de Boyacá'),
  ('2029-08-20', 'Asunción de la Virgen'),
  ('2029-10-15', 'Día de la Raza'),
  ('2029-11-05', 'Todos los Santos'),
  ('2029-11-12', 'Independencia de Cartagena'),
  ('2029-12-08', 'Inmaculada Concepción'),
  ('2029-12-25', 'Navidad'),
  ('2030-01-01', 'Año Nuevo'),
  ('2030-01-07', 'Reyes Magos'),
  ('2030-03-25', 'San José'),
  ('2030-04-18', 'Jueves Santo'),
  ('2030-04-19', 'Viernes Santo'),
  ('2030-05-01', 'Día del Trabajo'),
  ('2030-06-03', 'Ascensión del Señor'),
  ('2030-06-24', 'Corpus Christi'),
  ('2030-07-01', 'Sagrado Corazón y San Pedro y San Pablo'),
  ('2030-07-20', 'Independencia'),
  ('2030-08-07', 'Batalla de Boyacá'),
  ('2030-08-19', 'Asunción de la Virgen'),
  ('2030-10-14', 'Día de la Raza'),
  ('2030-11-04', 'Todos los Santos'),
  ('2030-11-11', 'Independencia de Cartagena'),
  ('2030-12-08', 'Inmaculada Concepción'),
  ('2030-12-25', 'Navidad'),
  ('2031-01-01', 'Año Nuevo'),
  ('2031-01-06', 'Reyes Magos'),
  ('2031-03-24', 'San José'),
  ('2031-04-10', 'Jueves Santo'),
  ('2031-04-11', 'Viernes Santo'),
  ('2031-05-01', 'Día del Trabajo'),
  ('2031-05-26', 'Ascensión del Señor'),
  ('2031-06-16', 'Corpus Christi'),
  ('2031-06-23', 'Sagrado Corazón'),
  ('2031-06-30', 'San Pedro y San Pablo'),
  ('2031-07-20', 'Independencia'),
  ('2031-08-07', 'Batalla de Boyacá'),
  ('2031-08-18', 'Asunción de la Virgen'),
  ('2031-10-13', 'Día de la Raza'),
  ('2031-11-03', 'Todos los Santos'),
  ('2031-11-17', 'Independencia de Cartagena'),
  ('2031-12-08', 'Inmaculada Concepción'),
  ('2031-12-25', 'Navidad'),
  ('2032-01-01', 'Año Nuevo'),
  ('2032-01-12', 'Reyes Magos'),
  ('2032-03-22', 'San José'),
  ('2032-03-25', 'Jueves Santo'),
  ('2032-03-26', 'Viernes Santo'),
  ('2032-05-01', 'Día del Trabajo'),
  ('2032-05-10', 'Ascensión del Señor'),
  ('2032-05-31', 'Corpus Christi'),
  ('2032-06-07', 'Sagrado Corazón'),
  ('2032-07-05', 'San Pedro y San Pablo'),
  ('2032-07-20', 'Independencia'),
  ('2032-08-07', 'Batalla de Boyacá'),
  ('2032-08-16', 'Asunción de la Virgen'),
  ('2032-10-18', 'Día de la Raza'),
  ('2032-11-01', 'Todos los Santos'),
  ('2032-11-15', 'Independencia de Cartagena'),
  ('2032-12-08', 'Inmaculada Concepción'),
  ('2032-12-25', 'Navidad')
;
