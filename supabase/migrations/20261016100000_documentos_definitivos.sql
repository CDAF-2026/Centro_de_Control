-- ============================================================================
-- Documentos definitivos revisados por el abogado del club (Laura, 16-oct-2026)
-- ----------------------------------------------------------------------------
-- Fuente: `Consentimiento informado/insumos/Nuevos documentos/`.
--
-- 1. Público nuevo `academias` para el Reglamento de Academias de Tenis y Pádel: lo acepta,
--    con su propia casilla, quien firma por un menor.
-- 2. La firma guarda las tres autorizaciones SÍ/NO del documento nuevo (datos de salud,
--    fotos y videos, información del centro) y la versión del Reglamento de Academias.
-- 3. `consentimiento_firmar` recibe opcionalmente los ids de versión que la PANTALLA mostró
--    (así lo firmado es exactamente lo leído) y las autorizaciones. Sin ids, como antes.
-- 4. Cuatro versiones nuevas EN PREPARACIÓN (`vigente_desde` null): nadie las ve todavía.
--    Se abren junto con el despliegue del código, en una migración aparte (el "cambio").
--      · 2026-10-v2            consentimiento único (padre/madre/representante por el menor)
--      · 2026-10-adultos-v3    el mismo documento, firmado en nombre propio
--      · reglamento-2026-10-v2 Reglamento General nuevo + su Anexo 1 (para leer, sin firma aparte;
--                              el SÍ/NO de imagen del anexo no va: ya está en el consentimiento)
--      · academias-2026-10     Reglamento de Academias
--
-- Formato del consentimiento nuevo (lo parte `src/lib/registro/texto.ts`): un párrafo de
-- entrada "Yo, {{FIRMANTE}}…", numerales "N. Título. texto" (los párrafos de un mismo numeral
-- van con salto simple), y el bloque "AUTORIZACIONES" con las opciones marcadas [salud],
-- [imagen] e [informacion].
-- ============================================================================

alter table public.consentimiento_version drop constraint consentimiento_version_publico;
alter table public.consentimiento_version
  add constraint consentimiento_version_publico check (publico in ('menores', 'adultos', 'reglamento', 'academias'));

alter table public.consentimiento_firma
  add column academias_version_id bigint references public.consentimiento_version (id) on delete restrict,
  add column autoriza_salud boolean,
  add column autoriza_imagen boolean,
  add column autoriza_informacion boolean;
comment on column public.consentimiento_firma.academias_version_id is
  'Versión del Reglamento de Academias aceptada con esta firma (solo firmas por menores, desde oct-2026).';
comment on column public.consentimiento_firma.autoriza_salud is
  'SÍ/NO al tratamiento de la EPS y el RH, solo para emergencias. Null en firmas anteriores al documento de oct-2026.';
comment on column public.consentimiento_firma.autoriza_imagen is
  'SÍ/NO al uso de fotos y videos (numeral 9). Null en firmas anteriores al documento de oct-2026.';
comment on column public.consentimiento_firma.autoriza_informacion is
  'SÍ/NO a recibir información de eventos, torneos y promociones. Null en firmas anteriores al documento de oct-2026.';

-- Una versión elegida por la pantalla: debe existir, ser del público pedido y estar vigente o
-- en preparación (nunca una cerrada). Lo llama solo el servidor (service_role).
create or replace function private.consentimiento_version_elegida(p_id bigint, p_publico text)
returns public.consentimiento_version
language sql
stable
security definer
set search_path = ''
as $$
  select v from public.consentimiento_version v
   where v.id = p_id
     and v.publico = p_publico
     and (v.vigente_hasta is null or v.vigente_hasta >= current_date);
$$;
revoke all on function private.consentimiento_version_elegida(bigint, text) from public, anon, authenticated;

create or replace function public.consentimiento_firmar(p_datos jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_publico  text := coalesce(p_datos->>'publico', 'menores');
  v_version  public.consentimiento_version;
  v_regl     public.consentimiento_version;
  v_acad     public.consentimiento_version;
  v_cliente  bigint := nullif(p_datos->>'cliente_id', '')::bigint;
  v_miembro  bigint := nullif(p_datos->>'miembro_id', '')::bigint;
  v_id       uuid;
begin
  if nullif(p_datos->>'version_id', '') is not null then
    v_version := private.consentimiento_version_elegida((p_datos->>'version_id')::bigint, v_publico);
  else
    v_version := public.consentimiento_version_vigente(v_publico);
  end if;
  if v_version.id is null then
    raise exception 'No hay una versión vigente del consentimiento.' using errcode = 'P0001';
  end if;
  if nullif(p_datos->>'reglamento_version_id', '') is not null then
    v_regl := private.consentimiento_version_elegida((p_datos->>'reglamento_version_id')::bigint, 'reglamento');
  else
    v_regl := public.consentimiento_version_vigente('reglamento');
  end if;
  -- El Reglamento de Academias solo queda registrado si la persona marcó su casilla.
  if nullif(p_datos->>'academias_version_id', '') is not null then
    v_acad := private.consentimiento_version_elegida((p_datos->>'academias_version_id')::bigint, 'academias');
    if v_acad.id is null then
      raise exception 'La versión del Reglamento de Academias no es válida.' using errcode = 'P0001';
    end if;
  end if;
  if v_miembro is not null and not exists (
    select 1 from public.cliente_miembros m where m.id = v_miembro and m.cliente_id = v_cliente
  ) then
    raise exception 'El miembro % no pertenece a la ficha %', v_miembro, v_cliente using errcode = 'P0001';
  end if;

  insert into public.consentimiento_firma (
    solicitud_id, sesion_id, version_id, reglamento_version_id, academias_version_id, cliente_id, miembro_id, estado,
    firmante_nombre, firmante_documento, firmante_parentesco, firmante_celular, firmante_email,
    menor_nombre, menor_documento, menor_rh, eps, metodo, ip, user_agent,
    autoriza_salud, autoriza_imagen, autoriza_informacion
  ) values (
    nullif(p_datos->>'solicitud_id', '')::uuid,
    nullif(p_datos->>'sesion_id', '')::uuid,
    v_version.id,
    v_regl.id,
    v_acad.id,
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
    nullif(p_datos->>'user_agent', ''),
    nullif(p_datos->>'autoriza_salud', '')::boolean,
    nullif(p_datos->>'autoriza_imagen', '')::boolean,
    nullif(p_datos->>'autoriza_informacion', '')::boolean
  )
  returning id into v_id;

  insert into public.audit_log (actor_id, action, entity, entity_id, after)
  values (null, 'consentimiento.firmar', 'consentimiento_firma', v_id::text,
          jsonb_build_object('cliente_id', v_cliente, 'miembro_id', v_miembro, 'version', v_version.codigo,
                             'reglamento', v_regl.codigo, 'academias', v_acad.codigo,
                             'autoriza_salud', p_datos->'autoriza_salud', 'autoriza_imagen', p_datos->'autoriza_imagen',
                             'autoriza_informacion', p_datos->'autoriza_informacion'));

  return v_id;
end;
$$;
revoke all on function public.consentimiento_firmar(jsonb) from public, anon, authenticated;

-- ─────────────── Las cuatro versiones nuevas, en preparación ───────────────
insert into public.consentimiento_version (codigo, publico, titulo, texto, texto_sha256, vigente_desde) values
(
  '2026-10-v2', 'menores',
  'CONSENTIMIENTO INFORMADO, FICHA PERSONAL Y AUTORIZACIÓN DE TRATAMIENTO DE DATOS – CENTRO DEPORTIVO ALEJANDRO FALLA',
  $texto$Yo, {{FIRMANTE}}, identificado(a) con cédula {{DOCUMENTO}}, en calidad de {{CALIDAD}} del deportista menor de edad identificado en la Parte 1, declaro:

1. Participación voluntaria. Mi hijo(a) participa en forma voluntaria en las actividades deportivas del CENTRO DEPORTIVO AF, que incluyen, sin limitarse a ellas, tenis, pádel y gimnasio.

2. Salud, preparación y reglamento. Mi hijo(a) está en condiciones físicas y de salud adecuadas para participar en estas actividades. Me comprometo a informar al centro cualquier condición médica o limitación que pueda afectar su seguridad. Conozco y acepto el Reglamento General del CENTRO DEPORTIVO AF.

3. Riesgos y comportamiento. Conozco las características de las actividades y asumo, en nombre de mi hijo(a), los riesgos propios de la práctica deportiva, en especial los que se deriven del incumplimiento de las normas y reglamentos. Asumo la responsabilidad por los comportamientos inadecuados que pueda tener dentro o fuera de los escenarios deportivos.

4. EPS y cobertura en salud. Mi hijo(a) está afiliado(a) a la EPS indicada en la Parte 1, o a un sistema de salud equivalente, que cubrirá la atención médica por lesiones, accidentes o enfermedades que se presenten durante su permanencia en el CENTRO DEPORTIVO AF. El centro no asume la atención médica de estos eventos, salvo cuando se deban a dolo o culpa grave del centro, de su personal o de las condiciones de sus instalaciones.

5. Primeros auxilios. El CENTRO DEPORTIVO AF no tiene la obligación de prestar primeros auxilios. Si se ofrecen, acepto que mi hijo(a) los reciba del personal de soporte, paramédicos o médicos presentes, y entiendo que son una atención temporal mientras recibe atención médica formal.

6. Instrucciones y normas. Mi hijo(a) y yo debemos atender las instrucciones, reglamentos y normas que, por escrito o por cualquier otro medio, dé el personal del centro, los jueces o el personal de primeros auxilios.

7. Sanciones. Conozco y acepto las sanciones que el CENTRO DEPORTIVO AF aplica a adultos y niños cuando se incumple el reglamento, como retirar de la clase, sin devolución de dinero, a quien agreda a un compañero o a un profesor.

8. Tratamiento de datos personales (Ley 1581 de 2012). El responsable del tratamiento es Centro Deportivo Alejandro Falla – Tenis y Pádel S.A.S., NIT 901482072-6, Vía Los Caballos Bar, Llano Grande, Rionegro, Antioquia, teléfono 315 735 5407, correo centrodeportivoaf@gmail.com.
Los datos de la Parte 1, incluidos los que ya se hayan entregado antes en fichas físicas, se usan para: (a) registrar al deportista e inscribirlo en clases, torneos y actividades; (b) contactar a los padres sobre horarios, pagos, novedades y emergencias; (c) atender emergencias médicas o accidentes y avisar a la EPS y a la familia; (d) llevar el control administrativo, contable y de seguridad del centro y expedir la factura electrónica; y (e) guardar este consentimiento como soporte.
La EPS y el RH son datos sensibles. Se piden solo para actuar en caso de emergencia y no es obligatorio entregarlos ni autorizar su tratamiento. Los datos del menor se tratan respetando sus derechos y su interés superior, y las preguntas sobre ellos son de respuesta facultativa.
Como titular o representante del menor puedo conocer, actualizar y rectificar los datos; pedir prueba de esta autorización; saber cómo se han usado; revocar la autorización o pedir que se borren, cuando no exista un deber legal o contractual de conservarlos; presentar quejas ante la Superintendencia de Industria y Comercio; y acceder gratis a los datos. Las solicitudes se envían a centrodeportivoaf@gmail.com y las atiende la gerente general. Las consultas se responden en máximo 10 días hábiles y los reclamos en máximo 15 días hábiles. La política de tratamiento de datos está disponible en www.centrodeportivoaf.com.

9. Fotografías y videos. Solo si lo autorizo abajo, el centro podrá usar fotos y videos en los que aparezca mi hijo(a), tomados durante clases, torneos y eventos, únicamente en su página web, sus redes sociales y su material impreso, para mostrar sus actividades. El uso es gratuito, no se cederá a terceros con fines comerciales y no se publicará su nombre completo ni datos que permitan ubicarlo. Si no lo autorizo, mi hijo(a) puede participar igual en todas las actividades. Puedo retirar esta autorización en cualquier momento escribiendo a centrodeportivoaf@gmail.com.

10. Declaración final. Con mi firma declaro que leí y entendí este documento, que conozco el Reglamento General del centro y que acepto los riesgos propios de la práctica deportiva en nombre del menor que represento. Entiendo que el CENTRO DEPORTIVO ALEJANDRO FALLA no responde por lesiones derivadas de esos riesgos propios del deporte, salvo cuando se deban a dolo o culpa grave del centro, de su personal o de las condiciones de sus instalaciones.

AUTORIZACIONES

Con mi firma acepto el consentimiento informado, el Reglamento General y el tratamiento de los datos personales para las finalidades del numeral 8. Además, marco con una X:

[salud] Datos de salud. Autorizo el tratamiento de la EPS y el RH de mi hijo(a), solo para atender emergencias.

[imagen] Fotos y videos. Autorizo el uso de fotos y videos de mi hijo(a) en los términos del numeral 9.

[informacion] Información del centro. Acepto recibir información de eventos, torneos y promociones por WhatsApp o correo.

Puedo cambiar estas autorizaciones cuando quiera escribiendo a centrodeportivoaf@gmail.com.$texto$,
  '', null
),
(
  '2026-10-adultos-v3', 'adultos',
  'CONSENTIMIENTO INFORMADO, FICHA PERSONAL Y AUTORIZACIÓN DE TRATAMIENTO DE DATOS – CENTRO DEPORTIVO ALEJANDRO FALLA',
  $texto$Yo, {{FIRMANTE}}, identificado(a) con {{DOCUMENTO}}, en nombre propio, declaro:

1. Participación voluntaria. Participo en forma voluntaria en las actividades deportivas del CENTRO DEPORTIVO AF, que incluyen, sin limitarse a ellas, tenis, pádel y gimnasio.

2. Salud, preparación y reglamento. Estoy en condiciones físicas y de salud adecuadas para participar en estas actividades. Me comprometo a informar al centro cualquier condición médica o limitación que pueda afectar mi seguridad. Conozco y acepto el Reglamento General del CENTRO DEPORTIVO AF.

3. Riesgos y comportamiento. Conozco las características de las actividades y asumo, en nombre propio, los riesgos propios de la práctica deportiva, en especial los que se deriven del incumplimiento de las normas y reglamentos. Asumo la responsabilidad por los comportamientos inadecuados que pueda tener dentro o fuera de los escenarios deportivos.

4. EPS y cobertura en salud. Estoy afiliado(a) a la EPS indicada en la Parte 1, o a un sistema de salud equivalente, que cubrirá la atención médica por lesiones, accidentes o enfermedades que se presenten durante mi permanencia en el CENTRO DEPORTIVO AF. El centro no asume la atención médica de estos eventos, salvo cuando se deban a dolo o culpa grave del centro, de su personal o de las condiciones de sus instalaciones.

5. Primeros auxilios. El CENTRO DEPORTIVO AF no tiene la obligación de prestar primeros auxilios. Si se ofrecen, acepto recibirlos del personal de soporte, paramédicos o médicos presentes, y entiendo que son una atención temporal mientras recibo atención médica formal.

6. Instrucciones y normas. Debo atender las instrucciones, reglamentos y normas que, por escrito o por cualquier otro medio, dé el personal del centro, los jueces o el personal de primeros auxilios.

7. Sanciones. Conozco y acepto las sanciones que el CENTRO DEPORTIVO AF aplica a adultos y niños cuando se incumple el reglamento, como retirar de la clase, sin devolución de dinero, a quien agreda a un compañero o a un profesor.

8. Tratamiento de datos personales (Ley 1581 de 2012). El responsable del tratamiento es Centro Deportivo Alejandro Falla – Tenis y Pádel S.A.S., NIT 901482072-6, Vía Los Caballos Bar, Llano Grande, Rionegro, Antioquia, teléfono 315 735 5407, correo centrodeportivoaf@gmail.com.
Los datos de la Parte 1, incluidos los que ya se hayan entregado antes en fichas físicas, se usan para: (a) registrarme e inscribirme en clases, torneos y actividades; (b) contactarme sobre horarios, pagos, novedades y emergencias; (c) atender emergencias médicas o accidentes y avisar a la EPS y a mi familia; (d) llevar el control administrativo, contable y de seguridad del centro y expedir la factura electrónica; y (e) guardar este consentimiento como soporte.
La EPS y el RH son datos sensibles. Se piden solo para actuar en caso de emergencia y no es obligatorio entregarlos ni autorizar su tratamiento.
Como titular de los datos puedo conocer, actualizar y rectificar los datos; pedir prueba de esta autorización; saber cómo se han usado; revocar la autorización o pedir que se borren, cuando no exista un deber legal o contractual de conservarlos; presentar quejas ante la Superintendencia de Industria y Comercio; y acceder gratis a los datos. Las solicitudes se envían a centrodeportivoaf@gmail.com y las atiende la gerente general. Las consultas se responden en máximo 10 días hábiles y los reclamos en máximo 15 días hábiles. La política de tratamiento de datos está disponible en www.centrodeportivoaf.com.

9. Fotografías y videos. Solo si lo autorizo abajo, el centro podrá usar fotos y videos en los que aparezca, tomados durante clases, torneos y eventos, únicamente en su página web, sus redes sociales y su material impreso, para mostrar sus actividades. El uso es gratuito y no se cederá a terceros con fines comerciales. Si no lo autorizo, puedo participar igual en todas las actividades. Puedo retirar esta autorización en cualquier momento escribiendo a centrodeportivoaf@gmail.com.

10. Declaración final. Con mi firma declaro que leí y entendí este documento, que conozco el Reglamento General del centro y que acepto, en nombre propio, los riesgos propios de la práctica deportiva. Entiendo que el CENTRO DEPORTIVO ALEJANDRO FALLA no responde por lesiones derivadas de esos riesgos propios del deporte, salvo cuando se deban a dolo o culpa grave del centro, de su personal o de las condiciones de sus instalaciones.

AUTORIZACIONES

Con mi firma acepto el consentimiento informado, el Reglamento General y el tratamiento de los datos personales para las finalidades del numeral 8. Además, marco con una X:

[salud] Datos de salud. Autorizo el tratamiento de mi EPS y mi RH, solo para atender emergencias.

[imagen] Fotos y videos. Autorizo el uso de fotos y videos en los que aparezca, en los términos del numeral 9.

[informacion] Información del centro. Acepto recibir información de eventos, torneos y promociones por WhatsApp o correo.

Puedo cambiar estas autorizaciones cuando quiera escribiendo a centrodeportivoaf@gmail.com.$texto$,
  '', null
),
(
  'reglamento-2026-10-v2', 'reglamento',
  'REGLAMENTO GENERAL DEL CENTRO DEPORTIVO ALEJANDRO FALLA',
  $texto$Bienvenido a tu segundo hogar deportivo

El presente reglamento es emitido por Centro Deportivo Alejandro Falla – Tenis y Pádel S.A.S., sociedad comercial legalmente constituida en Colombia, identificada con NIT 901482072-6, domiciliada en Rionegro, Antioquia, la cual actúa como única administradora, gestora y responsable de las instalaciones y actividades aquí reguladas.

El uso de las instalaciones y la participación en las actividades implica la aceptación expresa, irrevocable y vinculante de las condiciones del presente reglamento, el cual forma parte integrante del contrato de prestación de servicios celebrado entre el usuario y el Centro Deportivo.

# CAPÍTULO 1: CUIDADO Y BUEN USO DE NUESTRAS INSTALACIONES

Queremos que el Centro Deportivo Alejandro Falla sea un lugar limpio, cómodo y acogedor para todos. ¡Contamos contigo!

## Artículo 1. Limpieza y Orden

Los usuarios deberán mantener siempre limpios los espacios que utilicen, incluyendo canchas, baños, duchas, zonas verdes y demás instalaciones del Centro Deportivo. Se debe hacer uso correcto de las canecas para reciclaje, depositando la basura en el contenedor del color correspondiente. Al utilizar baños y duchas, los usuarios deberán dejarlos en condiciones adecuadas, garantizando el bienestar de los siguientes usuarios.

## Artículo 2. Uso y Cuidado de Equipamiento Personal

Los usuarios podrán hacer uso de toallas pequeñas para absorber el sudor durante la actividad física y toallas grandes para su uso posterior al ducharse. Es obligación devolverlas al finalizar su uso, manteniendo así la disponibilidad y el orden para todos.

## Artículo 3. Uso Responsable de las Instalaciones

Cada espacio debe ser utilizado únicamente para el propósito para el cual está destinado, respetando las normas internas y demás disposiciones. Cualquier daño intencional a la infraestructura o equipamiento será imputado al responsable y afectará la experiencia de todos los usuarios. Es deber de cada persona cuidar las instalaciones como si fueran propias.

## Artículo 4. Trato Respetuoso

Todos los usuarios deben mantener un trato respetuoso hacia el equipo de trabajo del Centro Deportivo, incluyendo entrenadores, personal de limpieza, administración, cafetería y mantenimiento, así como hacia los demás usuarios. Fomentar un ambiente armonioso y de respeto es responsabilidad conjunta de la comunidad deportiva.

# CAPÍTULO 2: RESERVAS Y PAGOS DE CLASES

Queremos que agendar y disfrutar tus clases sea fácil y claro.

## Artículo 5. Cancelación De Clases

La cancelación de la clase deberá efectuarse con una antelación mínima de doce (12) horas. En caso de suspensión por causas climáticas, se entenderá como clase completa cuando hayan transcurrido más de treinta (30) minutos desde su inicio. Si la suspensión se produce antes de dicho tiempo, únicamente se cobrará el cincuenta por ciento (50%) del valor de la clase.

## Artículo 6. Cambios Y Ausencias

En caso de no realizar la cancelación dentro del plazo señalado o, en su defecto, no presentarse a la clase, se efectuará el cobro total del valor correspondiente.

## Artículo 7. Horario de atención para reservas, y donde realizar las reservas

El horario de atención para la gestión de reservas será de lunes a viernes, de 7:00 a.m. a 9:30 p.m., y los fines de semana, de 8:00 a.m. a 7:00 p.m.

Las reservas deberán efectuarse a través de la aplicación EasyCancha, plataforma oficial del Club. En caso de presentarse dificultades técnicas o de acceso, el usuario podrá comunicarse al número de teléfono 315 735 5407 para recibir asistencia. Dentro de la plataforma se encontrarán disponibles los medios de pago autorizados para la confirmación de la reserva.

# CAPÍTULO 3: ACADEMIAS DE TENIS Y PÁDEL

Buscamos que cada clase sea una experiencia positiva de aprendizaje, respeto y mejora personal.

## Artículo 8. Puntualidad y Pagos mensuales

Las clases iniciarán de manera puntual, en caso de retraso por parte del alumno, únicamente se dictará el tiempo restante de la sesión programada. El valor correspondiente a la academia se establecerá bajo la modalidad de mensualidad fija, sin que este se determine por el número de clases efectivamente asistidas. El pago de la mensualidad deberá efectuarse dentro de los primeros diez (10) días calendario de cada mes. Los pagos realizados dentro de los primeros 10 días tendrán un descuento, pasado esta fecha se pagará el valor total de la academia.

## Artículo 9. Reposición de Clases

Las clases podrán reponerse en caso de fuerza mayor, como enfermedad o accidente, siempre que la ausencia sea informada y justificada oportunamente. En caso de mal clima, el Centro Deportivo ofrecerá clases alternativas dentro de instalaciones cubiertas.

## Artículo 10. Comportamiento y Presentación

Los usuarios deberán presentarse a las clases con raqueta, ropa deportiva y calzado adecuado para la práctica de la disciplina. Además, deberán mantener una actitud positiva, respetuosa y colaborativa, reconociendo que el respeto es parte fundamental del aprendizaje.

## Artículo 11. Cancelación del Servicio Mensual

En caso de que el usuario decida no continuar con las clases en un mes determinado, deberá informar al Centro Deportivo con al menos una semana de anticipación. Si no se realiza esta notificación, el cobro correspondiente al mes siguiente se hará efectivo como parte de las condiciones de contratación.

## Artículo 12. Cambios operativos y disposiciones de seguridad

El Centro Deportivo podrá efectuar ajustes en los horarios, condiciones o modalidades de las actividades, los cuales serán comunicados previamente a los usuarios por los medios oficiales dispuestos para tal fin.

El Centro Deportivo procurará velar en todo momento por la seguridad y el bienestar de los participantes; sin embargo, no asumirá responsabilidad por accidentes o incidentes que ocurran fuera del desarrollo de las clases o actividades programadas. Se recomienda a todos los usuarios contar con un seguro médico vigente que incluya cobertura para la práctica de actividades deportivas.

# CAPÍTULO 4: PAQUETES DE PÁDEL

¡Para quienes prefieren organizarse con anticipación!

## Artículo 13. Duración y frecuencia

Los paquetes tienen fecha de vencimiento, serán informados al momento de su compra.

Parágrafo 1. Pago: El valor total del paquete deberá ser cancelado en su totalidad antes del inicio de las clases.

## Artículo 14. Condiciones

Se aplicarán las siguientes condiciones:

Las clases deberán tomarse en el horario reservado.

La inasistencia de uno o ambos participantes implicará que la clase se considere dictada.

No se permite la acumulación de clases, ni la utilización del saldo en otros servicios del Centro Deportivo.

Los horarios acordados deberán respetarse estrictamente.

Cualquier modificación será comunicada previamente por los canales oficiales del Centro Deportivo.

# CAPÍTULO 5 USO DEL PARQUE Y ZONAS COMUNES

## Artículo 15. Responsabilidad del Acompañante

El acompañante tendrá las siguientes responsabilidades:

Los menores de edad deberán permanecer en todo momento bajo la supervisión directa del adulto responsable que los acompañe.

Las mascotas deberán estar bajo el cuidado y control permanente de su propietario, garantizando su adecuada conducta y seguridad.

Todos los usuarios y visitantes deberán actuar con prudencia y respeto, evitando conductas que puedan generar accidentes o deteriorar las instalaciones, procurando en todo momento el cuidado y preservación de estos espacios comunes.

# CAPÍTULO 6. DISPOSICIONES LEGALES Y DE SEGURIDAD

## Artículo 16. Protección de Datos Personales

El Centro Deportivo Alejandro Falla, en calidad de responsable del tratamiento de datos personales, en cumplimiento de la Ley 1581 de 2012, el Decreto 1377 de 2013 y demás normas concordantes, informa a sus usuarios que los datos personales suministrados serán recolectados, almacenados, usados, circulados y protegidos conforme a los principios de finalidad, legalidad, libertad, veracidad, transparencia, acceso y circulación restringida, seguridad y confidencialidad.

Los datos serán tratados exclusivamente para fines administrativos, comerciales, operativos y de seguridad propios del Centro Deportivo, garantizando que el tratamiento se realizará únicamente con el consentimiento previo, expreso e informado del titular, salvo las excepciones previstas en la ley. Asimismo, serán almacenados por el tiempo estrictamente necesario para cumplir con las finalidades señaladas y se adoptarán las medidas técnicas, administrativas y de seguridad pertinentes para impedir el acceso no autorizado, la pérdida, alteración o uso indebido de la información.

El tratamiento de los datos personales podrá ser realizado, total o parcialmente, por terceros que actúen como Encargados del Tratamiento por cuenta del Centro Deportivo Alejandro Falla, incluyendo proveedores tecnológicos o plataformas utilizadas para la recolección y el almacenamiento de la información, quienes estarán obligados a cumplir con la Ley 1581 de 2012 y sus decretos reglamentarios.

El titular de los datos personales, o su representante legal en el caso de menores de edad, podrá en cualquier momento conocer, actualizar y rectificar sus datos; pedir prueba de la autorización otorgada; ser informado sobre el uso que se les ha dado; revocar la autorización o solicitar la supresión de los datos cuando no exista un deber legal o contractual de conservarlos; y presentar quejas ante la Superintendencia de Industria y Comercio. Las solicitudes se envían al correo electrónico oficial del Centro Deportivo, centrodeportivoaf@gmail.com, y las atiende la gerente general. Las consultas se responden en un término máximo de diez (10) días hábiles y los reclamos en un término máximo de quince (15) días hábiles.

La autorización para el tratamiento de los datos se otorga mediante el consentimiento informado y la ficha personal que firma cada usuario o, en el caso de menores de edad, su representante legal. La política de tratamiento de datos personales del Centro Deportivo está disponible en www.centrodeportivoaf.com.

## Artículo 17. Tratamiento de Datos Sensibles

El Centro Deportivo Alejandro Falla, en cumplimiento con la Ley 1581 de 2012, el Decreto 1377 de 2013 y demás normativa vigente, reconoce la especial protección que requieren los datos personales sensibles, tales como información relacionada con la salud, origen étnico, orientación sexual, datos biométricos o cualquier otra categoría definida por la ley.

Se adoptarán medidas técnicas, administrativas y de seguridad apropiadas para garantizar la confidencialidad, integridad, disponibilidad y protección contra el acceso no autorizado, la alteración, pérdida, transferencia o divulgación indebida de la información sensible.

Los datos de salud que el Centro Deportivo solicita, como la EPS y el grupo sanguíneo (RH), se usan únicamente para atender emergencias. Su entrega es voluntaria y el titular, o su representante legal, no está obligado a autorizar su tratamiento.

## Artículo 18. Videovigilancia

El Centro Deportivo Alejandro Falla informa a sus usuarios que sus instalaciones cuentan con un sistema de videovigilancia operando las 24 horas del día, con el propósito exclusivo de proteger la integridad física de los usuarios, visitantes y colaboradores, así como la seguridad de los bienes y la prevención de actos ilícitos o conductas indebidas.

Las imágenes y grabaciones captadas por el sistema de videovigilancia serán tratadas conforme a los principios y obligaciones establecidos en la Ley 1581 de 2012 y normas complementarias, garantizando la protección, seguridad y confidencialidad de la información recolectada. El acceso a las grabaciones estará restringido únicamente al personal autorizado del Centro Deportivo y a las autoridades competentes cuando medie requerimiento legal o judicial.

## Artículo 19. Derecho de Admisión y Permanencia

El Centro Deportivo Alejandro Falla se reserva el derecho de admisión y permanencia, de acuerdo con lo establecido en la Ley 1801 de 2016 (Código Nacional de Seguridad y Convivencia Ciudadana). Este derecho podrá ejercerse frente a personas que: a) Incumplan el presente reglamento o las instrucciones del personal autorizado. b) Adopten conductas agresivas, irrespetuosas o que pongan en riesgo la seguridad de terceros. c) Se encuentren bajo el efecto de alcohol o sustancias psicoactivas. El ejercicio de este derecho no generará obligación de reembolso por servicios o reservas ya pagadas y no disfrutadas.

## Artículo 20. Responsabilidad Civil y Exoneración

El usuario reconoce y acepta que la práctica de actividades deportivas en el Centro Deportivo Alejandro Falla implica riesgos inherentes y previsibles propios de la disciplina y la actividad física, tales como golpes, caídas, lesiones musculares, óseas o articulares y fatiga. Por ello, declara encontrarse en condiciones físicas y de salud adecuadas para su participación y se compromete a informar previamente al Centro sobre cualquier condición médica o limitación que pueda afectar su seguridad o la de terceros.

En tal sentido, el usuario asume dichos riesgos inherentes y previsibles y, en esa medida, exime al Centro Deportivo de responsabilidad civil por las lesiones, accidentes, pérdidas o robos que se deriven de su materialización dentro de las instalaciones, salvo que se demuestre dolo o culpa grave atribuible al Centro, su personal o a las condiciones de la infraestructura. Asimismo, el usuario se compromete a cumplir con todas las normas de seguridad, a utilizar el equipo adecuado y a acatar las instrucciones del personal autorizado para minimizar riesgos durante la práctica deportiva.

El Centro Deportivo no será responsable por actos u omisiones de terceros dentro o fuera de sus instalaciones, salvo que exista negligencia comprobada en la prestación del servicio de vigilancia y seguridad.

Se recomienda enfáticamente que el usuario cuente con un seguro personal que cubra accidentes deportivos, gastos médicos y daños a terceros, aclarando que el Centro no es responsable ni contratante de dicho seguro.

## Artículo 21. Normas de Conducta

Los usuarios del Centro Deportivo deberán abstenerse de consumir alcohol, drogas o sustancias psicoactivas dentro de las instalaciones, así como de incurrir en conductas violentas, discriminatorias, agresivas o irrespetuosas hacia otros usuarios, visitantes o miembros del personal. El incumplimiento de estas normas podrá conllevar la expulsión inmediata del usuario, la prohibición de ingreso futuro y, en casos graves, la puesta en conocimiento de las autoridades competentes para la adopción de medidas administrativas o judiciales correspondientes.

El Centro Deportivo se reserva el derecho de iniciar los procedimientos administrativos internos que considere pertinentes para investigar cualquier conducta que contravenga estas disposiciones, garantizando el debido proceso y el derecho a la defensa. Los usuarios pueden reportar cualquier conducta indebida a través del correo electrónico oficial, centrodeportivoaf@gmail.com, con la seguridad de que dichas denuncias serán tratadas con confidencialidad y seriedad.

## Artículo 22. Uso de Imagen y Propiedad Intelectual

Con su autorización expresa, otorgada en el consentimiento informado, el usuario o su representante legal permite al Centro Deportivo Alejandro Falla usar su imagen, o la del menor que representa, en fotografías y videos captados durante eventos, clases, torneos u otras actividades del Centro. Este material se usará únicamente en la página web, las redes sociales y el material impreso del Centro, con fines informativos y de difusión institucional, sin remuneración para el usuario y sin cederlo a terceros con fines comerciales. En publicaciones de menores de edad no se incluirá su nombre completo ni datos que permitan ubicarlos.

Esta autorización es voluntaria. Quien no la otorgue puede participar igual en todas las actividades, y quien la haya otorgado puede retirarla en cualquier momento escribiendo a centrodeportivoaf@gmail.com.

Se prohíbe a los usuarios grabar, fotografiar o difundir imágenes de otros usuarios, visitantes o personal sin su consentimiento previo y explícito, respetando el derecho a la imagen y la privacidad establecidos en la normativa vigente y la jurisprudencia colombiana. Cualquier uso indebido de imágenes o material audiovisual será sancionado de conformidad con las normas internas del Centro Deportivo y las disposiciones legales vigentes.

## Artículo 23. Procedimientos Ante Incidentes

Todo accidente, daño, conducta irregular, incumplimiento del reglamento o situación que afecte la seguridad, integridad o el normal desarrollo de las actividades dentro del Centro Deportivo deberá ser reportado inmediatamente al personal autorizado o a la administración del Centro.

El Centro Deportivo se compromete a documentar cada caso y a mantener un registro formal, ordenado y confidencial de los incidentes reportados, con el fin de dar seguimiento, atención oportuna y toma de decisiones administrativas o disciplinarias, cuando corresponda.

Se habilitará el correo oficial del club, centrodeportivoaf@gmail.com, y otros canales de atención para la recepción de quejas, denuncias y reclamos, los cuales serán comunicados a todos los usuarios, garantizando acceso, confidencialidad, protección de datos personales y respeto al debido proceso. El Centro Deportivo responderá a las reclamaciones y reportes en un término de 15 días hábiles conforme a la normatividad aplicable, procurando siempre la protección de los derechos de los usuarios y el mantenimiento de un ambiente seguro y respetuoso.

## Artículo 24. Gestión de Riesgos y Protocolos de Emergencia

El Centro Deportivo Alejandro Falla cuenta con protocolos establecidos para la atención de emergencias médicas, evacuación y contingencias en las instalaciones. Los usuarios se comprometen a acatar las indicaciones del personal en estas situaciones para proteger su seguridad y la de terceros.

## Artículo 25. Prevención y Control del Dopaje

El Centro Deportivo Alejandro Falla se compromete a promover y garantizar la integridad deportiva, adoptando y realizando acciones encaminadas a la prevención y control del dopaje, conforme a la normativa nacional e internacional vigente aplicable en Colombia.

Asimismo, se prohíbe terminantemente la utilización, suministro, posesión o promoción de sustancias dopantes dentro de las instalaciones o en el marco de las actividades organizadas por el Centro Deportivo.

El incumplimiento de esta disposición será objeto de sanciones que podrán incluir amonestaciones, suspensiones temporales o permanentes, exclusión de competencias, y otras medidas disciplinarias establecidas en el reglamento y en concordancia con la legislación aplicable.

# CAPÍTULO 7 – DISPOSICIONES COMPLEMENTARIAS

## Artículo 26 – Aceptación Contractual

El uso de las instalaciones, la participación en las actividades y/o la adquisición de servicios ofrecidos por el Centro Deportivo Alejandro Falla – Tenis y Pádel S.A.S. implica la aceptación expresa, irrevocable y vinculante de todas las disposiciones contenidas en el presente reglamento. Este reglamento hace parte integral de los contratos de prestación de servicios celebrados entre el usuario y el Centro, y será plenamente exigible en lo que corresponda.

## Artículo 27 – Actualización y Modificación del Reglamento

El Centro Deportivo Alejandro Falla – Tenis y Pádel S.A.S. podrá modificar, actualizar o complementar el presente reglamento en cualquier momento, con el fin de garantizar la seguridad, el orden y la adecuada prestación de los servicios. Dichas modificaciones serán comunicadas por los canales oficiales del Centro y entrarán en vigor inmediatamente después de su publicación, sin que ello genere obligación de reembolso o indemnización alguna.

## Artículo 28 – Limitación de Responsabilidad Ampliada

El Centro Deportivo Alejandro Falla – Tenis y Pádel S.A.S. no será responsable por daños, pérdidas o perjuicios indirectos, incidentales, especiales o consecuenciales de carácter patrimonial, incluyendo, pero sin limitarse, a la pérdida de ingresos, interrupción de actividades o lucro cesante, salvo que medie dolo o culpa grave comprobada. Esta limitación no aplica a las lesiones o afectaciones a la salud o integridad de los usuarios, las cuales se rigen por lo dispuesto en el artículo 20 del presente Reglamento. La responsabilidad del Centro frente a los usuarios por reclamaciones de carácter patrimonial derivadas del servicio contratado, en cualquier caso, estará limitada al valor efectivamente pagado por dicho servicio.

## Artículo 29 – Sanciones y Medidas Disciplinarias

El incumplimiento del presente reglamento o de las instrucciones del personal autorizado faculta al Centro Deportivo Alejandro Falla – Tenis y Pádel S.A.S. para imponer las siguientes medidas, según la gravedad de la infracción:

a) Amonestación verbal o escrita.

b) Suspensión temporal del derecho de uso de las instalaciones.

c) Cancelación definitiva de la membresía o contrato sin derecho a reembolso.

d) Restricción de ingreso a eventos, torneos y demás actividades.

## Artículo 30 – Competencia Judicial y Ley Aplicable

Cualquier controversia o diferencia derivada de la interpretación, aplicación o ejecución del presente reglamento se regirá por las leyes de la República de Colombia y será resuelta ante los jueces competentes del municipio de Rionegro, Antioquia, renunciando las partes a cualquier otro fuero que pudiera corresponderles por razón de su domicilio presente o futuro.

## Artículo 31 – Prohibición de Reclamaciones Abusivas

El usuario se abstendrá de presentar reclamaciones infundadas, de mala fe o con el propósito de obtener beneficios indebidos. La presentación de este tipo de reclamaciones podrá dar lugar a la terminación inmediata de la relación contractual y a la adopción de acciones legales para la reparación de los daños y perjuicios ocasionados al Centro Deportivo Alejandro Falla – Tenis y Pádel S.A.S.

## Artículo 32 – Uso de Imagen – Edición del Material

El Centro Deportivo podrá editar o adaptar el material audiovisual autorizado conforme al artículo 22, siempre que no se altere la dignidad ni el buen nombre del usuario y que se use solo en los medios señalados en ese artículo.

# CAPÍTULO 8. CONSIDERACIONES FINALES

Artículo 33. El presente reglamento tiene como finalidad garantizar una experiencia armónica, respetuosa y segura para todos los miembros y usuarios del club. El cumplimiento de sus disposiciones es obligatorio y constituye un compromiso esencial para la adecuada convivencia y el buen funcionamiento de las actividades. La utilización continua de los servicios e instalaciones del club implicará la aceptación expresa de las normas aquí establecidas.

# ANEXO 1 – DECLARACIÓN DE ASUNCIÓN DE RIESGO Y EXONERACIÓN DE RESPONSABILIDAD CIVIL

CENTRO DEPORTIVO ALEJANDRO FALLA (TENIS Y PADEL SAS) Nit: 901482072-6 Dirección: Vía los caballos bar, Llano Grande, Rionegro, Antioquia

En cumplimiento de lo dispuesto en la Ley 181 de 1995 (Ley del Deporte), la Ley 1581 de 2012 (Protección de Datos Personales), el Código Civil Colombiano (artículos 2341 y siguientes sobre responsabilidad civil), el Código Nacional de Seguridad y Convivencia Ciudadana – Ley 1801 de 2016, así como demás normas concordantes, el suscrito(a) usuario(a) declara bajo la gravedad de juramento que:

## PRIMERO. Reconocimiento de Riesgo

He sido informado(a) de que la práctica de actividades físicas y deportivas, así como el uso de las instalaciones del Centro Deportivo Alejandro Falla, implica riesgos inherentes tales como lesiones musculares, óseas, articulares, accidentes, caídas, golpes, fatiga, deshidratación, así como daños o pérdida de bienes personales.

Reconozco que dichos riesgos no pueden ser eliminados completamente, incluso con la adopción de todas las medidas preventivas y de seguridad por parte del Club.

## SEGUNDO. Condiciones de Salud

Declaro que me encuentro en condiciones de salud física y mental aptas para realizar actividad física, y que no padezco limitaciones médicas que me impidan participar en actividades deportivas.

Asumo la responsabilidad exclusiva de someterme previamente a una valoración médica, conforme a lo previsto en el artículo 17 de la Ley 181 de 1995, y de comunicar al Club cualquier diagnóstico, condición o tratamiento que pueda afectar mi seguridad.

## TERCERO. Uso Adecuado de Instalaciones

Me comprometo a utilizar las instalaciones y equipos de manera responsable, siguiendo las instrucciones del personal autorizado y las reglas establecidas en el Reglamento General del Centro Deportivo.

Reconozco que cualquier daño a la infraestructura, por uso indebido o negligente, será de mi exclusiva responsabilidad económica.

## CUARTO. Exoneración de Responsabilidad Civil

Libero y mantengo indemne al Centro Deportivo Alejandro Falla, sus administradores, directivos, empleados, contratistas y colaboradores, de cualquier reclamación, demanda, acción o indemnización derivada de:

Lesiones o daños derivados de la materialización de los riesgos inherentes y previsibles de la práctica deportiva reconocidos en el numeral PRIMERO de esta declaración.

Robo, hurto o pérdida de bienes personales.

Accidentes ocurridos por causas fortuitas, fuerza mayor, actos de terceros o por mi propia conducta negligente.

Esta exoneración no aplica en los casos de dolo o culpa grave comprobada del Club, conforme al artículo 63 del Código Civil Colombiano.

## QUINTO. Seguro Personal

Declaro que cuento, o me obligo a contratar, un seguro personal vigente que cubra accidentes deportivos, gastos médicos, incapacidad y daños a terceros, conforme a la recomendación del Club y la práctica habitual en entidades deportivas en Colombia.

Entiendo que el Club no asume la obligación de contratar ni cubrir estos seguros, salvo que expresamente se pacte lo contrario por escrito.

## SEXTO. Actividades y Eventos Externos

En caso de participación en torneos, salidas o actividades organizadas por el Club fuera de sus instalaciones, acepto que los riesgos aumentan y que igualmente mantendré indemne al Club, salvo en los casos de dolo o culpa grave.

## SÉPTIMO. Protección de Datos Personales

Autorizo el tratamiento de mis datos personales conforme a la Ley 1581 de 2012 y el Decreto 1377 de 2013, para las finalidades administrativas, operativas, de seguridad y de facturación del Club, según la política de tratamiento de datos publicada en www.centrodeportivoaf.com.

## OCTAVO. Uso de Imagen

Autorizo al Club a usar mi imagen en fotografías y videos tomados durante eventos o actividades, en los términos del artículo 22 del Reglamento General.

## NOVENO. Vigencia y Aceptación

Esta declaración tiene vigencia indefinida mientras sea usuario(a) o participe en actividades del Centro Deportivo Alejandro Falla, y se entenderá aceptada con mi firma.$texto$,
  '', null
),
(
  'academias-2026-10', 'academias',
  'REGLAMENTO ACADEMIAS TENIS Y PÁDEL – CENTRO DEPORTIVO ALEJANDRO FALLA',
  $texto$El presente reglamento tiene como finalidad establecer las normas y condiciones que regirán la participación en las academias de tenis y pádel del Centro Deportivo Alejandro Falla, con el objetivo de garantizar un servicio de calidad, ordenado y respetuoso para todos los participantes.

## 1. Puntualidad

Los alumnos deberán presentarse puntualmente a sus clases, las cuales comenzarán en el horario previsto, sin esperar a aquellos alumnos que lleguen con retraso.

En caso de que un alumno llegue tarde, la clase no se extenderá más allá del tiempo previsto ni será reprogramada. El retraso no justifica la ampliación de la clase ni su reposición.

## 2. Pago de Clases

El pago de las academias deberá realizarse en los primeros diez (10) días de cada mes, cubriendo el total de las clases programadas para ese mes, independientemente de las clases a las que el alumno asista.

El pago se calcula sobre la base de un número fijo de clases mensuales, no por las clases individuales a las que el alumno asista.

En todas las academias del Centro Deportivo se cobra matricula cada semestre por valor de $200.000.

## 3. Reposición de Clases

Las clases solo podrán ser reprogramadas en casos de fuerza mayor (enfermedad, accidente, circunstancias externas que impidan la realización de la clase), y siempre que la ausencia se haya comunicado con la debida antelación, acompañada de una justificación médica o de fuerza mayor.

En situaciones como viajes, compromisos personales u otros motivos no justificados, las clases solo podrán ser reprogramadas si se avisa con al menos una semana de anticipación.

Si la clase es suspendida por causas atribuibles al Centro Deportivo Alejandro Falla (condiciones climáticas extremas, situaciones imprevistas, etc.), se podrá reprogramar la clase o, en su defecto, reembolsar el valor de la misma, según lo determine la administración.

Si la clase no se puede dar en las canchas de tenis o pádel debido al clima, el Centro Deportivo cuenta con clases programadas de preparación física o ejercicios específicos y estos se darán en la carpa o en las canchas techadas y se considera una clase normal.

## 4. Normas Generales de Comportamiento

Los alumnos deberán asistir a las clases con el equipo adecuado para la práctica de tenis o pádel, incluyendo raqueta, ropa deportiva y calzado adecuado.

El respeto hacia los demás alumnos y los instructores es fundamental para mantener un ambiente armonioso y propicio para el aprendizaje.

Queda estrictamente prohibido el uso de lenguaje ofensivo, comportamientos disruptivos o cualquier actitud que interfiera en el desarrollo normal de las clases.

## 5. Política de Cancelación y Suspensión de Clases

En caso de que un alumno desee suspender su participación en la academia, deberá notificarlo al Centro Deportivo con al menos una semana de antelación al inicio del mes siguiente. En caso de no cumplirse con este plazo, se procederá al cobro de la totalidad del mes siguiente.

## 6. Modificaciones y Actualizaciones

El Centro Deportivo Alejandro Falla se reserva el derecho de modificar los horarios de clases, tarifas y otros aspectos operativos de la academia, los cuales serán debidamente comunicados a los alumnos.

Los cambios en las condiciones se considerarán válidos una vez que sean notificados a los alumnos, quienes deberán adaptarse a las nuevas disposiciones establecidas.

## 7. Responsabilidad y Seguridad

La participación en las academias implica la aceptación de los riesgos inherentes y previsibles de la práctica del tenis y el pádel (golpes, caídas, lesiones musculares, óseas o articulares, fatiga, entre otros), en los términos del artículo 20 del Reglamento General del Centro Deportivo Alejandro Falla.

El Centro Deportivo Alejandro Falla no será responsable por los accidentes o lesiones derivados de la materialización de dichos riesgos, ni por aquellos que puedan ocurrir fuera del ámbito de las clases programadas, salvo que se demuestre dolo o culpa grave atribuible al Centro, su personal o las condiciones de la infraestructura.

Se recomienda a todos los alumnos contar con un seguro de salud que cubra posibles lesiones o incidentes durante la práctica de tenis o pádel.

## 8. Datos Personales e Imagen

El tratamiento de los datos personales y el uso de imagen de los alumnos se rigen por el Reglamento General del Centro Deportivo Alejandro Falla, el consentimiento informado y la política de tratamiento de datos publicada en www.centrodeportivoaf.com. Las solicitudes sobre datos personales se envían a centrodeportivoaf@gmail.com.

## 9. Aceptación del Reglamento

Al inscribirse en las academias de tenis y pádel del Centro Deportivo Alejandro Falla, el alumno acepta de manera expresa e íntegra las condiciones establecidas en este reglamento. El incumplimiento de las normas podrá dar lugar a la cancelación de la inscripción o a la suspensión temporal de las clases. Este reglamento debe ser leído y firmado por los tutores legales en el caso de tratarse de un alumno menor de edad. Al firmar, los tutores también aceptan las condiciones aquí detalladas.$texto$,
  '', null
);
