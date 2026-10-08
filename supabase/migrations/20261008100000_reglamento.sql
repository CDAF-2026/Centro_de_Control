-- Reglamento General del club, aceptado junto con el consentimiento (Laura, 8-oct-2026, opción A:
-- casilla "Conozco y acepto el Reglamento…" con el texto a un toque en /registro/reglamento).
--
-- Se guarda en la MISMA tabla de textos legales versionados, con `publico = 'reglamento'`: una
-- vigente a la vez (el índice único por público ya existe), huella por trigger, misma RLS. El
-- texto va con marcas de estructura para pintarlo por capítulos y artículos: una línea "# …" es
-- capítulo y "## …" es artículo; el resto, párrafos. El ANEXO 1 del Word NO va: repite el
-- consentimiento. Fuente: `Consentimiento informado/insumos/REGLAMENTO AF DEFINITIVO sin firma.docx`.
-- La firma guarda qué versión del reglamento aceptó (`consentimiento_firma.reglamento_version_id`).

alter table public.consentimiento_version drop constraint consentimiento_version_publico;
alter table public.consentimiento_version
  add constraint consentimiento_version_publico check (publico in ('menores', 'adultos', 'reglamento'));

alter table public.consentimiento_firma
  add column reglamento_version_id bigint references public.consentimiento_version (id) on delete restrict;
comment on column public.consentimiento_firma.reglamento_version_id is
  'Versión del Reglamento General aceptada con esta firma (null en las firmas anteriores al 8-oct-2026).';

-- Al firmar se registra la versión vigente del reglamento, si la hay.
create or replace function public.consentimiento_firmar(p_datos jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version  public.consentimiento_version;
  v_regl     public.consentimiento_version;
  v_cliente  bigint := nullif(p_datos->>'cliente_id', '')::bigint;
  v_miembro  bigint := nullif(p_datos->>'miembro_id', '')::bigint;
  v_id       uuid;
begin
  v_version := public.consentimiento_version_vigente(coalesce(p_datos->>'publico', 'menores'));
  if v_version.id is null then
    raise exception 'No hay una versión vigente del consentimiento.' using errcode = 'P0001';
  end if;
  v_regl := public.consentimiento_version_vigente('reglamento');

  if v_miembro is not null and not exists (
    select 1 from public.cliente_miembros m where m.id = v_miembro and m.cliente_id = v_cliente
  ) then
    raise exception 'El miembro % no pertenece a la ficha %', v_miembro, v_cliente using errcode = 'P0001';
  end if;

  insert into public.consentimiento_firma (
    solicitud_id, sesion_id, version_id, reglamento_version_id, cliente_id, miembro_id, estado,
    firmante_nombre, firmante_documento, firmante_parentesco, firmante_celular, firmante_email,
    menor_nombre, menor_documento, menor_rh, eps, metodo, ip, user_agent
  ) values (
    nullif(p_datos->>'solicitud_id', '')::uuid,
    nullif(p_datos->>'sesion_id', '')::uuid,
    v_version.id,
    v_regl.id,
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
          jsonb_build_object('cliente_id', v_cliente, 'miembro_id', v_miembro, 'version', v_version.codigo, 'reglamento', v_regl.codigo));

  return v_id;
end;
$$;
revoke all on function public.consentimiento_firmar(jsonb) from public, anon, authenticated;

-- ─────────────── Semilla: reglamento 2026-10, abierto desde hoy ───────────────
insert into public.consentimiento_version (codigo, publico, titulo, texto, texto_sha256, vigente_desde)
values (
  'reglamento-2026-10',
  'reglamento',
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

La cancelación de la clase deberá efectuarse con una antelación mínima de veinticuatro (12) horas. En caso de suspensión por causas climáticas, se entenderá como clase completa cuando hayan transcurrido más de treinta (30) minutos desde su inicio. Si la suspensión se produce antes de dicho tiempo, únicamente se cobrará el cincuenta por ciento (50%) del valor de la clase.

## Artículo 6. Cambios Y Ausencias

En caso de no realizar la cancelación dentro del plazo señalado o, en su defecto, no presentarse a la clase, se efectuará el cobro total del valor correspondiente.

## Artículo 7. Horario de atención para reservas, y donde realizar las reservas

El horario de atención para la gestión de reservas será de lunes a viernes, de 7:00 a.m. a 9:30 p.m., y los fines de semana, de 8:00 a.m. a 7:00 p.m.

Las reservas deberán efectuarse a través de la aplicación EasyCancha, plataforma oficial del Club. En caso de presentarse dificultades técnicas o de acceso, el usuario podrá comunicarse al número de teléfono 315 735 5407 para recibir asistencia. Dentro de la plataforma se encontrarán disponibles los medios de pago autorizados para la confirmación de la reserva.

# CAPÍTULO 3: ACADEMIAS DE TENIS Y PÁDEL

Buscamos que cada clase sea una experiencia positiva de aprendizaje, respeto y mejora personal.

## Artículo 8. Puntualidad y Pagos mensuales

Las clases iniciarán de manera puntual, en caso de retraso por parte del alumno, únicamente se dictará el tiempo restante de la sesión programada.El valor correspondiente a la academia se establecerá bajo la modalidad de mensualidad fija, sin que este se determine por el número de clases efectivamente asistidas.El pago de la mensualidad deberá efectuarse dentro de los primeros quince (10) días calendario de cada mes. Los pagos realizados dentro de los primeros 10 días tendrán un descuento, pasado esta fecha se pagará el valor total de la academia.

## Artículo 9. Reposición de Clases

Las clases podrán reponerse en caso de fuerza mayor, como enfermedad o accidente, siempre que la ausencia sea informada y justificada oportunamente. En caso de mal clima, el Centro Deportivo ofrecerá clases alternativas dentro de instalaciones cubiertas.

## Artículo 10. Comportamiento y Presentación

Los usuarios deberán presentarse a las clases con raqueta, ropa deportiva y calzado adecuado para la práctica de la disciplina. Además, deberán mantener una actitud positiva, respetuosa y colaborativa, reconociendo que el respeto es parte fundamental del aprendizaje.

## Artículo 11. Cancelación del Servicio Mensual

En caso de que el usuario decida no continuar con las clases en un mes determinado, deberá informar al Centro Deportivo con al menos una semana de anticipación. Si no se realiza esta notificación, el cobro correspondiente al mes siguiente se hará efectivo como parte de las condiciones de contratación.

## Artículo 12. Cambios operativos y disposiciones de seguridad

El Centro Deportivo podrá efectuar ajustes en los horarios, condiciones o modalidades de las actividades, los cuales serán comunicados previamente a los usuarios por los medios oficiales dispuestos para tal fin.

El Centro Deportivo procurará velar en todo momento por la seguridad y el bienestar de los participantes; sin embargo, no asumirá responsabilidad por accidentes o incidentes que ocurran fuera del desarrollo de las clases o actividades programadas.Se recomienda a todos los usuarios contar con un seguro médico vigente que incluya cobertura para la práctica de actividades deportivas.

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

## Artículo 14. Responsabilidad del Acompañante

El acompañante tendrá las siguientes responsabilidades:

Los menores de edad deberán permanecer en todo momento bajo la supervisión directa del adulto responsable que los acompañe.

Las mascotas deberán estar bajo el cuidado y control permanente de su propietario, garantizando su adecuada conducta y seguridad.

Todos los usuarios y visitantes deberán actuar con prudencia y respeto, evitando conductas que puedan generar accidentes o deteriorar las instalaciones, procurando en todo momento el cuidado y preservación de estos espacios comunes.

# CAPÍTULO 6. DISPOSICIONES LEGALES Y DE SEGURIDAD

## Artículo 15. Protección de Datos Personales

El Centro Deportivo Alejandro Falla, en calidad de responsable del tratamiento de datos personales, en cumplimiento de la Ley 1581 de 2012, el Decreto 1377 de 2013 y demás normas concordantes, informa a sus usuarios que los datos personales suministrados serán recolectados, almacenados, usados, circulados y protegidos conforme a los principios de finalidad, legalidad, libertad, veracidad, transparencia, acceso y circulación restringida, seguridad y confidencialidad.

Los datos serán tratados exclusivamente para fines administrativos, comerciales, operativos y de seguridad propios del Centro Deportivo, garantizando que el tratamiento se realizará únicamente con el consentimiento previo, expreso e informado del titular, salvo las excepciones previstas en la ley. Asimismo, serán almacenados por el tiempo estrictamente necesario para cumplir con las finalidades señaladas y se adoptarán las medidas técnicas, administrativas y de seguridad pertinentes para impedir el acceso no autorizado, la pérdida, alteración o uso indebido de la información.

El titular de los datos personales podrá ejercer en cualquier momento los derechos de acceso, rectificación, actualización, supresión y oposición mediante solicitud escrita que deberá remitir al correo electrónico oficial del Centro Deportivo. La respuesta será proporcionada en un término no mayor a quince (15) días hábiles, salvo causas justificadas debidamente explicadas.

La entrega voluntaria de datos personales al Centro Deportivo implica la aceptación de este tratamiento conforme a lo aquí establecido y el conocimiento pleno de los derechos y garantías contenidos en la legislación vigente.

## Artículo 17. Tratamiento de Datos Sensibles

El Centro Deportivo Alejandro Falla, en cumplimiento con la Ley 1581 de 2012, el Decreto 1377 de 2013 y demás normativa vigente, reconoce la especial protección que requieren los datos personales sensibles, tales como información relacionada con la salud, origen étnico, orientación sexual, datos biométricos o cualquier otra categoría definida por la ley.

Se adoptarán medidas técnicas, administrativas y de seguridad apropiadas para garantizar la confidencialidad, integridad, disponibilidad y protección contra el acceso no autorizado, la alteración, pérdida, transferencia o divulgación indebida de la información sensible.

## Artículo 18. Videovigilancia

El Centro Deportivo Alejandro Falla informa a sus usuarios que sus instalaciones cuentan con un sistema de videovigilancia operando las 24 horas del día, con el propósito exclusivo de proteger la integridad física de los usuarios, visitantes y colaboradores, así como la seguridad de los bienes y la prevención de actos ilícitos o conductas indebidas.

Las imágenes y grabaciones captadas por el sistema de videovigilancia serán tratadas conforme a los principios y obligaciones establecidos en la Ley 1581 de 2012 y normas complementarias, garantizando la protección, seguridad y confidencialidad de la información recolectada. El acceso a las grabaciones estará restringido únicamente al personal autorizado del Centro Deportivo y a las autoridades competentes cuando medie requerimiento legal o judicial.

## Artículo 19. Derecho de Admisión y Permanencia

El Centro Deportivo Alejandro Falla se reserva el derecho de admisión y permanencia, de acuerdo con lo establecido en la Ley 1801 de 2016 (Código Nacional de Seguridad y Convivencia Ciudadana). Este derecho podrá ejercerse frente a personas que:a) Incumplan el presente reglamento o las instrucciones del personal autorizado.b) Adopten conductas agresivas, irrespetuosas o que pongan en riesgo la seguridad de terceros.c) Se encuentren bajo el efecto de alcohol o sustancias psicoactivas.El ejercicio de este derecho no generará obligación de reembolso por servicios o reservas ya pagadas y no disfrutadas.

## Artículo 20. Responsabilidad Civil y Exoneración

El usuario reconoce y acepta que la práctica de actividades deportivas en el Centro Deportivo Alejandro Falla implica riesgos inherentes propios de la disciplina y la actividad física. Por ello, declara encontrarse en condiciones físicas y de salud adecuadas para su participación y se compromete a informar previamente al Centro sobre cualquier condición médica o limitación que pueda afectar su seguridad o la de terceros.En tal sentido, el usuario exime al Centro Deportivo de responsabilidad civil por lesiones, accidentes, pérdidas o robos sufridos dentro de las instalaciones, salvo que se demuestre dolo o culpa grave atribuible al Centro, su personal o a las condiciones de la infraestructura.Asimismo, el usuario se compromete a cumplir con todas las normas de seguridad, a utilizar el equipo adecuado y a acatar las instrucciones del personal autorizado para minimizar riesgos durante la práctica deportiva.

El Centro Deportivo no será responsable por actos u omisiones de terceros dentro o fuera de sus instalaciones, salvo que exista negligencia comprobada en la prestación del servicio de vigilancia y seguridad.

Se recomienda enfáticamente que el usuario cuente con un seguro personal que cubra accidentes deportivos, gastos médicos y daños a terceros, aclarando que el Centro no es responsable ni contratante de dicho seguro.

## Artículo 21. Normas de Conducta

Los usuarios del Centro Deportivo deberán abstenerse de consumir alcohol, drogas o sustancias psicoactivas dentro de las instalaciones, así como de incurrir en conductas violentas, discriminatorias, agresivas o irrespetuosas hacia otros usuarios, visitantes o miembros del personal. El incumplimiento de estas normas podrá conllevar la expulsión inmediata del usuario, la prohibición de ingreso futuro y, en casos graves, la puesta en conocimiento de las autoridades competentes para la adopción de medidas administrativas o judiciales correspondientes.

El Centro Deportivo se reserva el derecho de iniciar los procedimientos administrativos internos que considere pertinentes para investigar cualquier conducta que contravenga estas disposiciones, garantizando el debido proceso y el derecho a la defensa.Los usuarios pueden reportar cualquier conducta indebida a través del correo electrónico oficial, con la seguridad de que dichas denuncias serán tratadas con confidencialidad y seriedad.

## Artículo 22. Uso de Imagen y Propiedad Intelectual

Con la aceptación del presente reglamento, el usuario autoriza de manera libre, voluntaria, expresa e informada al Centro Deportivo Alejandro Falla para el uso, reproducción, difusión y publicación de su imagen en fotografías, videos, transmisiones o grabaciones audiovisuales captadas durante eventos, clases, torneos u otras actividades organizadas por el Centro. Dicha autorización se otorga exclusivamente para fines promocionales, publicitarios, informativos y de difusión institucional del Centro Deportivo, sin que exista remuneración o compensación económica alguna para el usuario.

El usuario podrá manifestar su oposición expresa y por escrito para que su imagen no sea utilizada para estos fines, procedimiento que deberá ser atendido oportunamente por el Centro Deportivo.

Se prohíbe a los usuarios grabar, fotografiar o difundir imágenes de otros usuarios, visitantes o personal sin su consentimiento previo y explícito, respetando el derecho a la imagen y la privacidad establecidos en la normativa vigente y la jurisprudencia colombiana.Cualquier uso indebido de imágenes o material audiovisual será sancionado de conformidad con las normas internas del Centro Deportivo y las disposiciones legales vigentes.

## Artículo 23. Procedimientos Ante Incidentes

Todo accidente, daño, conducta irregular, incumplimiento del reglamento o situación que afecte la seguridad, integridad o el normal desarrollo de las actividades dentro del Centro Deportivo deberá ser reportado inmediatamente al personal autorizado o a la administración del Centro.

El Centro Deportivo se compromete a documentar cada caso y a mantener un registro formal, ordenado y confidencial de los incidentes reportados, con el fin de dar seguimiento, atención oportuna y toma de decisiones administrativas o disciplinarias, cuando corresponda.

Se habilitará el correo oficial del club y otros canales de atención para la recepción de quejas, denuncias y reclamos, los cuales serán comunicados a todos los usuarios, garantizando acceso, confidencialidad, protección de datos personales y respeto al debido proceso.El Centro Deportivo responderá a las reclamaciones y reportes en un término de 15 días hábiles conforme a la normatividad aplicable, procurando siempre la protección de los derechos de los usuarios y el mantenimiento de un ambiente seguro y respetuoso.

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

El Centro Deportivo Alejandro Falla – Tenis y Pádel S.A.S. no será responsable por daños, pérdidas o perjuicios indirectos, incidentales, especiales o consecuenciales, incluyendo, pero sin limitarse, a la pérdida de ingresos, interrupción de actividades, lucro cesante o daño moral, salvo que medie dolo o culpa grave comprobada. La responsabilidad del Centro frente a los usuarios, en cualquier caso, estará limitada al valor efectivamente pagado por el servicio contratado en el que se origine el reclamo.

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

## Artículo 32 – Uso de Imagen y Propiedad Intelectual – Ampliación

La autorización de uso de imagen otorgada por los usuarios al Centro Deportivo Alejandro Falla – Tenis y Pádel S.A.S. comprende su reproducción, difusión, edición y publicación en cualquier medio físico o digital, nacional o internacional, incluyendo redes sociales, páginas web, campañas publicitarias y material institucional. El Centro podrá adaptar o editar el material audiovisual sin requerir nueva autorización, siempre que no se altere la dignidad o buen nombre del usuario.

# CAPÍTULO 8. CONSIDERACIONES FINALES

Artículo 28. El presente reglamento tiene como finalidad garantizar una experiencia armónica, respetuosa y segura para todos los miembros y usuarios del club. El cumplimiento de sus disposiciones es obligatorio y constituye un compromiso esencial para la adecuada convivencia y el buen funcionamiento de las actividades. La utilización continua de los servicios e instalaciones del club implicará la aceptación expresa de las normas aquí establecidas.$texto$,
  '',
  current_date
);
