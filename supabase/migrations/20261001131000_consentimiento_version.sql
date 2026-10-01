-- ============================================================================
-- Texto del consentimiento informado, versionado (Fase 1, 1-oct-2026)
-- ----------------------------------------------------------------------------
-- Cada firma queda atada a la versión EXACTA del texto que la persona leyó
-- (`consentimiento_firma.version_id`). Si el club cambia una coma, se crea otra
-- versión y las firmas viejas siguen valiendo con la suya.
--
-- `vigente_desde` NULL = la página pública muestra "En preparación". Es la
-- puerta natural del despliegue: el código de la landing puede estar en
-- producción sin que nadie pueda firmar hasta que Laura abra la versión.
--
-- El texto es el de `Consentimiento informado/insumos/CONSENTIMIENTO INFORMADO
-- MENORES DE EDAD .docx` (definitivo y revisado, decisión D6). El espacio de la
-- EPS va como marcador `{{EPS}}` para que el PDF lo rellene.
-- ============================================================================

create table public.consentimiento_version (
  id             bigint generated always as identity primary key,
  codigo         text not null unique,          -- '2026-10'
  titulo         text not null,
  texto          text not null,                 -- párrafos separados por línea en blanco
  texto_sha256   text not null,                 -- huella del texto, para la hoja de evidencia
  vigente_desde  date,                          -- null = todavía no se puede firmar
  vigente_hasta  date,
  creado_por     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  constraint consentimiento_version_rango check (vigente_hasta is null or vigente_desde is not null)
);

-- Una sola versión vigente a la vez.
create unique index consentimiento_version_vigente_uidx
  on public.consentimiento_version ((true))
  where vigente_desde is not null and vigente_hasta is null;

comment on table public.consentimiento_version is
  'Versiones del texto del consentimiento informado. La firma apunta a la que se leyó.';

-- En Supabase toda tabla nueva nace con todos los privilegios para anon y
-- authenticated (0082). Se cierran y se devuelve solo la lectura al personal.
revoke all on public.consentimiento_version from anon, authenticated;
grant select on public.consentimiento_version to authenticated;
alter table public.consentimiento_version enable row level security;

create policy "consentimiento_version_select" on public.consentimiento_version
  for select to authenticated
  using (private.user_role() in ('superadmin', 'coord_admin'));
-- Escritura: solo por migración o service_role (igual que `servicios`).

-- La huella se calcula en SQL para que texto y hash nunca se desincronicen.
create or replace function private.consentimiento_version_sellar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.texto_sha256 := encode(extensions.digest(convert_to(new.texto, 'UTF8'), 'sha256'), 'hex');
  return new;
end;
$$;

create trigger consentimiento_version_sellar
  before insert or update of texto on public.consentimiento_version
  for each row execute function private.consentimiento_version_sellar();

-- Versión vigente (o null). La usa la página pública vía service_role y el PDF.
create or replace function public.consentimiento_version_vigente()
returns public.consentimiento_version
language sql
stable
security definer
set search_path = ''
as $$
  select v from public.consentimiento_version v
   where v.vigente_desde is not null
     and v.vigente_desde <= current_date
     and (v.vigente_hasta is null or v.vigente_hasta >= current_date)
   order by v.vigente_desde desc
   limit 1;
$$;
revoke all on function public.consentimiento_version_vigente() from public, anon;
grant execute on function public.consentimiento_version_vigente() to authenticated;

-- ─────────────── Semilla: versión 2026-10, SIN abrir ───────────────
insert into public.consentimiento_version (codigo, titulo, texto, texto_sha256, vigente_desde)
values (
  '2026-10',
  'CONSENTIMIENTO INFORMADO, TRATAMIENTO Y USO DE DATOS Y EXONERACIÓN DE RESPONSABILIDAD EN LAS ACTIVIDADES DEPORTIVAS – CENTRO DEPORTIVO AALEJANDRO FALLA',
  $texto$Declaro que en forma voluntaria he decidido participar o permitir que mi hijo (a) participe, en las actividades deportivas del CENTRO DEPORTIVO AF, que incluyen pero no se limitan a actividades deportivas como gimnasio, Pádel, Tenis, atletismo entre otras.

Declaro así mismo en nombre propio o en calidad de titular de la patria potestad, que quien desarrolla las actividades deportivas en el CENTRO DEPORTIVO AF está en perfectas condiciones físicas y de salud, así como adecuadamente entrenado y preparado para participar en los mismos. Igualmente, declaro que conozco y acepto el reglamento del CENTRO DEPORTIVO AF.

Declaro conocer perfectamente las características de las actividades que se realizarán, y asumo en nombre propio y en nombre de mi hijo (a) todos los riesgos asociados con mi participación o su participación especialmente los que se deriven del incumplimiento de las normas establecidas en las bases generales, reglamentos por deporte y asumo mi responsabilidad por los comportamientos inadecuados que pueda tener tanto dentro como fuera de los escenarios deportivos.

Declaro en nombre propio y a nombre de mi hijo (a), cuando fuere el caso, que quien hará actividades deportivas dentro del CENTRO DEPORTIVO AF, está afiliado a la EPS {{EPS}}. Así mismo declaro que mi cobertura en salud, y afiliación al sistema de seguridad social en salud o equivalentes en otros países cubrirá posibles lesiones, accidentes o enfermedad, heridas o lastimaduras durante mi estadía en el CENTRO DEPORTIVO AF. En el evento de enfermedades, traumatismos derivados de la participación, tanto presentes como secuelas futuras, declaro que mi seguro cubre y cubrirá toda la atención medica derivada de esos eventos. Así mismo libero al CENTRO DEPORTIVO AF, de cualquier daño asociado a lesiones sufridas dentro de las instalaciones del mismo, tanto de aquellas que tengan como consecuencia un daño emergente o un lucro cesante.

Declaro que el CENTRO DEPORTIVO AF no tiene la obligación de prestar primeros auxilios, sin embargo, cuando ello se me proporcione, acepto el servicio de primeros auxilios ofrecido por los paramédicos, médicos o personal de soporte en caso de accidente durante el evento. También entiendo que este auxilio médico es meramente temporal y circunstancial durante el tiempo del desarrollo del evento.

Declaro entender y obedecer todas las instrucciones, reglamentos y normas, ya sea escrita o por cualquier otro medio perceptible provisto por el personal organizador, juzgamiento o de primeros auxilios o empresas contratadas para prestar asistencia durante la competencia.

Declaro entender y acatar las sanciones que el CENTRO DEPORTIVO AF ha considerado para adultos y niños cuando hay una falta al reglamento, como retirar a quien agreda a alguno de sus compañeros o profesores durante la clase, sin que haya devolución alguna de dinero.

De acuerdo a la Ley 1581 de 2012 para la protección de datos personales, cuyo objeto es desarrollar el derecho constitucional que tienen todas las personas a conocer, actualizar y rectificar las informaciones que se hayan recogido sobre ellas en bases de datos o archivos, y los demás derechos, libertades y garantías constitucionales a que se refiere el artículo 15 de la Constitución Política; así como el derecho a la información consagrado en el artículo 20 de la misma. Autorizo para que mis datos personales, fotografías, películas, videos, grabaciones y cualquier otro medio de registro donde aparezca mi imagen y voz, puedan ser publicados en la página web del CENTRO DEPORTIVO AF, excluyendo al CENTRO DEPORTIVO AF, a esta Entidad de cualquier responsabilidad derivada de alguna demanda por situación de publicación de datos personales.

Así mismo, autorizo el uso del material fotográfico donde aparezca mi hijo (a), exclusivamente en material publicado en la página web y redes sociales del CENTRO DEPORTIVO AF y material gráfico físico.

Con la firma de este documento declaro conocer su texto integralmente y renuncio en nombre propio y/o en nombre de mi hijo (a) menor, a cualquier reclamación al CENTRO DEPORTIVO AF, por cualquier daño derivado de la práctica de deportes en sus instalaciones, así como declaro conocer las políticas de servicio de la academia y estar de acuerdo con su texto integral.$texto$,
  '',          -- la pone el trigger
  null         -- cerrada hasta que Laura la abra (Fase 4)
);
