-- Consentimiento informado para ADULTOS (pedido del club, 7-oct-2026).
-- Hasta hoy había UN texto vigente (el de menores) y los adultos no firmaban. Desde
-- ahora hay un texto por público: `menores` (el de siempre) y `adultos` (nuevo, firma
-- en nombre propio). Cada público tiene su propia versión vigente.
--
-- 1. `consentimiento_version.publico`.
-- 2. La unicidad de "una vigente a la vez" pasa a ser POR público.
-- 3. `consentimiento_version_vigente(p_publico)` (default 'menores': los llamadores
--    viejos siguen funcionando) y `consentimiento_firmar` lee `publico` del payload.
-- 4. Semilla: versión `2026-10-adultos`, ABIERTA desde hoy (el registro ya está en
--    producción). Texto del Word `CONSENTIMIENTO INFORMADO MAYORES DE EDAD .docx`,
--    íntegro, con el marcador {{EPS}} y el título con "ALEJANDRO" (el Word trae "AALEJANDRO").

alter table public.consentimiento_version
  add column publico text not null default 'menores'
  constraint consentimiento_version_publico check (publico in ('menores', 'adultos'));

drop index if exists public.consentimiento_version_vigente_uidx;
create unique index consentimiento_version_vigente_uidx
  on public.consentimiento_version (publico)
  where vigente_desde is not null and vigente_hasta is null;

drop function if exists public.consentimiento_version_vigente();
create or replace function public.consentimiento_version_vigente(p_publico text default 'menores')
returns public.consentimiento_version
language sql
stable
security definer
set search_path = ''
as $$
  select v from public.consentimiento_version v
   where v.publico = coalesce(p_publico, 'menores')
     and v.vigente_desde is not null
     and v.vigente_desde <= current_date
     and (v.vigente_hasta is null or v.vigente_hasta >= current_date)
   order by v.vigente_desde desc
   limit 1;
$$;
revoke all on function public.consentimiento_version_vigente(text) from public, anon;
grant execute on function public.consentimiento_version_vigente(text) to authenticated;

-- Misma función de firmar; solo cambia de dónde sale la versión (el público del payload).
create or replace function public.consentimiento_firmar(p_datos jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version  public.consentimiento_version;
  v_cliente  bigint := nullif(p_datos->>'cliente_id', '')::bigint;
  v_miembro  bigint := nullif(p_datos->>'miembro_id', '')::bigint;
  v_id       uuid;
begin
  v_version := public.consentimiento_version_vigente(coalesce(p_datos->>'publico', 'menores'));
  if v_version.id is null then
    raise exception 'No hay una versión vigente del consentimiento.' using errcode = 'P0001';
  end if;

  if v_miembro is not null and not exists (
    select 1 from public.cliente_miembros m where m.id = v_miembro and m.cliente_id = v_cliente
  ) then
    raise exception 'El miembro % no pertenece a la ficha %', v_miembro, v_cliente using errcode = 'P0001';
  end if;

  insert into public.consentimiento_firma (
    solicitud_id, sesion_id, version_id, cliente_id, miembro_id, estado,
    firmante_nombre, firmante_documento, firmante_parentesco, firmante_celular, firmante_email,
    menor_nombre, menor_documento, menor_rh, eps, metodo, ip, user_agent
  ) values (
    nullif(p_datos->>'solicitud_id', '')::uuid,
    nullif(p_datos->>'sesion_id', '')::uuid,
    v_version.id,
    v_cliente,
    v_miembro,
    case when v_cliente is not null and v_miembro is not null then 'asignada' else 'pendiente_asignar' end::public.firma_estado,
    p_datos->>'firmante_nombre',
    p_datos->>'firmante_documento',
    nullif(p_datos->>'firmante_parentesco', ''),
    nullif(p_datos->>'firmante_celular', ''),
    nullif(p_datos->>'firmante_email', ''),
    p_datos->>'menor_nombre',
    nullif(p_datos->>'menor_documento', ''),
    nullif(p_datos->>'menor_rh', ''),
    nullif(p_datos->>'eps', ''),
    (p_datos->>'metodo')::public.firma_metodo,
    nullif(p_datos->>'ip', '')::inet,
    nullif(p_datos->>'user_agent', '')
  )
  returning id into v_id;

  insert into public.audit_log (actor_id, action, entity, entity_id, after)
  values (null, 'consentimiento.firmar', 'consentimiento_firma', v_id::text,
          jsonb_build_object('cliente_id', v_cliente, 'miembro_id', v_miembro, 'version', v_version.codigo));

  return v_id;
end;
$$;
revoke all on function public.consentimiento_firmar(jsonb) from public, anon, authenticated;

-- ─────────────── Semilla: versión 2026-10-adultos, abierta desde hoy ───────────────
insert into public.consentimiento_version (codigo, publico, titulo, texto, texto_sha256, vigente_desde)
values (
  '2026-10-adultos',
  'adultos',
  'CONSENTIMIENTO INFORMADO, TRATAMIENTO Y USO DE DATOS Y EXONERACIÓN DE RESPONSABILIDAD EN LAS ACTIVIDADES DEPORTIVAS – CENTRO DEPORTIVO ALEJANDRO FALLA',
  $texto$Declaro que en forma voluntaria he decidido participar, en las actividades deportivas del CENTRO DEPORTIVO AF, que incluyen pero no se limitan a actividades deportivas como gimnasio, Pádel, Tenis, entre otras.

Declaro así mismo en nombre propio, que quien desarrolla las actividades deportivas en el CENTRO DEPORTIVO AF está en perfectas condiciones físicas y de salud, así como adecuadamente entrenado y preparado para participar en los mismos. Igualmente, declaro que conozco y acepto el reglamento del CENTRO DEPORTIVO AF.

Declaro conocer perfectamente las características de las actividades que se realizarán, y asumo en nombre propio y en nombre de mi hijo (a) todos los riesgos asociados con mi participación o su participación especialmente los que se deriven del incumplimiento de las normas establecidas en las bases generales, reglamentos por deporte y asumo mi responsabilidad por los comportamientos inadecuados que pueda tener tanto dentro como fuera de los escenarios deportivos.

Declaro en nombre propio, que quien hará actividades deportivas dentro del CENTRO DEPORTIVO AF, está afiliado a la EPS {{EPS}}. Así mismo declaro que mi cobertura en salud, y afiliación al sistema de seguridad social en salud o equivalentes en otros países cubrirá posibles lesiones, accidentes o enfermedad, heridas o lastimaduras durante mi estadía en el CENTRO DEPORTIVO AF. En el evento de enfermedades, traumatismos derivados de la participación, tanto presentes como secuelas futuras, declaro que mi seguro cubre y cubrirá toda la atención medica derivada de esos eventos. Así mismo libero al CENTRO DEPORTIVO AF, de cualquier daño asociado a lesiones sufridas dentro de las instalaciones del mismo, tanto de aquellas que tengan como consecuencia un daño emergente o un lucro cesante.

Declaro que el CENTRO DEPORTIVO AF no tiene la obligación de prestar primeros auxilios, sin embargo, cuando ello se me proporcione, acepto el servicio de primeros auxilios ofrecido por los paramédicos, médicos o personal de soporte en caso de accidente durante el evento. También entiendo que este auxilio médico es meramente temporal y circunstancial durante el tiempo del desarrollo del evento.

Declaro entender y obedecer todas las instrucciones, reglamentos y normas, ya sea escrita o por cualquier otro medio perceptible provisto por el personal organizador, juzgamiento o de primeros auxilios o empresas contratadas para prestar asistencia durante la competencia.

Declaro entender y acatar las sanciones que el CENTRO DEPORTIVO AF ha considerado para adultos y niños cuando hay una falta al reglamento, como retirar a quien agreda a alguno de sus compañeros o profesores durante la clase, sin que haya devolución alguna de dinero.

De acuerdo a la Ley 1581 de 2012 para la protección de datos personales, cuyo objeto es desarrollar el derecho constitucional que tienen todas las personas a conocer, actualizar y rectificar las informaciones que se hayan recogido sobre ellas en bases de datos o archivos, y los demás derechos, libertades y garantías constitucionales a que se refiere el artículo 15 de la Constitución Política; así como el derecho a la información consagrado en el artículo 20 de la misma. Autorizo para que mis datos personales, fotografías, películas, videos, grabaciones y cualquier otro medio de registro donde aparezca mi imagen y voz, puedan ser publicados en la página web del CENTRO DEPORTIVO AF, excluyendo al CENTRO DEPORTIVO AF, a esta Entidad de cualquier responsabilidad derivada de alguna demanda por situación de publicación de datos personales.

Así mismo, autorizo el uso del material fotográfico, exclusivamente en material publicado en la página web y redes sociales del CENTRO DEPORTIVO AF y material gráfico físico.

Con la firma de este documento declaro conocer su texto integralmente y renuncio en nombre propio a cualquier reclamación al CENTRO DEPORTIVO AF, por cualquier daño derivado de la práctica de deportes en sus instalaciones, así como declaro conocer las políticas de servicio de la academia y estar de acuerdo con su texto integral.$texto$,
  '',          -- la pone el trigger
  current_date
);
