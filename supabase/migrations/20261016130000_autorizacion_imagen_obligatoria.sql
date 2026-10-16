-- ============================================================================
-- Autorización de imagen OBLIGATORIA, con un solo chulito (Laura, 16-oct-2026)
-- ----------------------------------------------------------------------------
-- El club decidió que la autorización de fotos y videos sea condición para participar (en las
-- clases se toman fotos de grupo) y que el papá acepte todo con una sola marca, como en la
-- primera versión. El abogado aprobó la propuesta
-- `Consentimiento informado/para-abogado-16-oct/Propuesta ajuste autorización de imagen.docx`.
--
-- Tres versiones nuevas EN PREPARACIÓN (`vigente_desde` null); se abren en una migración aparte
-- después de desplegar el código:
--   · 2026-10-v3            menores: numeral 8 (EPS y RH voluntarios: si se entregan, quedan
--                           autorizados), numeral 9 (fotos = condición) y bloque "AUTORIZACIÓN"
--                           (sin SÍ/NO; solo [informacion] queda como casilla opcional)
--   · 2026-10-adultos-v4    lo mismo, en nombre propio
--   · reglamento-2026-10-v3 Reglamento General: cambia solo el 2.º párrafo del art. 22. Se copia de
--                           la v2 con replace() y se verifica que el cambio ocurrió.
-- Academias no cambia (`academias-2026-10` sigue vigente).
-- ============================================================================

insert into public.consentimiento_version (codigo, publico, titulo, texto, texto_sha256, vigente_desde) values
(
  '2026-10-v3', 'menores',
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
La EPS y el RH son datos sensibles. Entregarlos es voluntario y se pueden dejar en blanco en la Parte 1. Si los entrego, autorizo su tratamiento solo para actuar en caso de emergencia. Los datos del menor se tratan respetando sus derechos y su interés superior, y las preguntas sobre ellos son de respuesta facultativa.
Como titular o representante del menor puedo conocer, actualizar y rectificar los datos; pedir prueba de esta autorización; saber cómo se han usado; revocar la autorización o pedir que se borren, cuando no exista un deber legal o contractual de conservarlos; presentar quejas ante la Superintendencia de Industria y Comercio; y acceder gratis a los datos. Las solicitudes se envían a centrodeportivoaf@gmail.com y las atiende la gerente general. Las consultas se responden en máximo 10 días hábiles y los reclamos en máximo 15 días hábiles. La política de tratamiento de datos está disponible en www.centrodeportivoaf.com.

9. Fotografías y videos. Autorizo al centro a usar fotos y videos en los que aparezca mi hijo(a), tomados durante clases, torneos y eventos, únicamente en su página web, sus redes sociales y su material impreso, para mostrar sus actividades. El uso es gratuito, no se cederá a terceros con fines comerciales y no se publicará su nombre completo ni datos que permitan ubicarlo. Entiendo que esta autorización es una condición para participar en las clases y actividades del centro, porque en ellas se toman fotos y videos de grupo. Puedo revocarla escribiendo a centrodeportivoaf@gmail.com; en ese caso, el centro no publicará material nuevo en el que mi hijo(a) aparezca de forma individual y retirará, cuando sea posible, las publicaciones en las que aparezca.

10. Declaración final. Con mi firma declaro que leí y entendí este documento, que conozco el Reglamento General del centro y que acepto los riesgos propios de la práctica deportiva en nombre del menor que represento. Entiendo que el CENTRO DEPORTIVO ALEJANDRO FALLA no responde por lesiones derivadas de esos riesgos propios del deporte, salvo cuando se deban a dolo o culpa grave del centro, de su personal o de las condiciones de sus instalaciones.

AUTORIZACIÓN

Con mi firma acepto el consentimiento informado y el Reglamento General del CENTRO DEPORTIVO AF, y autorizo: (a) el tratamiento de los datos personales de mi hijo(a) para las finalidades del numeral 8, incluidos la EPS y el RH si los entrego, solo para atender emergencias; y (b) el uso de fotos y videos de mi hijo(a) en los términos del numeral 9.

[informacion] Información del centro (opcional). Acepto recibir información de eventos, torneos y promociones por WhatsApp o correo. Puedo retirar esta autorización cuando quiera escribiendo a centrodeportivoaf@gmail.com.$texto$,
  '', null
),
(
  '2026-10-adultos-v4', 'adultos',
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
La EPS y el RH son datos sensibles. Entregarlos es voluntario y se pueden dejar en blanco en la Parte 1. Si los entrego, autorizo su tratamiento solo para actuar en caso de emergencia.
Como titular de los datos puedo conocer, actualizar y rectificar los datos; pedir prueba de esta autorización; saber cómo se han usado; revocar la autorización o pedir que se borren, cuando no exista un deber legal o contractual de conservarlos; presentar quejas ante la Superintendencia de Industria y Comercio; y acceder gratis a los datos. Las solicitudes se envían a centrodeportivoaf@gmail.com y las atiende la gerente general. Las consultas se responden en máximo 10 días hábiles y los reclamos en máximo 15 días hábiles. La política de tratamiento de datos está disponible en www.centrodeportivoaf.com.

9. Fotografías y videos. Autorizo al centro a usar fotos y videos en los que aparezca, tomados durante clases, torneos y eventos, únicamente en su página web, sus redes sociales y su material impreso, para mostrar sus actividades. El uso es gratuito y no se cederá a terceros con fines comerciales. Entiendo que esta autorización es una condición para participar en las clases y actividades del centro, porque en ellas se toman fotos y videos de grupo. Puedo revocarla escribiendo a centrodeportivoaf@gmail.com; en ese caso, el centro no publicará material nuevo en el que aparezca de forma individual y retirará, cuando sea posible, las publicaciones en las que aparezca.

10. Declaración final. Con mi firma declaro que leí y entendí este documento, que conozco el Reglamento General del centro y que acepto, en nombre propio, los riesgos propios de la práctica deportiva. Entiendo que el CENTRO DEPORTIVO ALEJANDRO FALLA no responde por lesiones derivadas de esos riesgos propios del deporte, salvo cuando se deban a dolo o culpa grave del centro, de su personal o de las condiciones de sus instalaciones.

AUTORIZACIÓN

Con mi firma acepto el consentimiento informado y el Reglamento General del CENTRO DEPORTIVO AF, y autorizo: (a) el tratamiento de mis datos personales para las finalidades del numeral 8, incluidos mi EPS y mi RH si los entrego, solo para atender emergencias; y (b) el uso de fotos y videos en los que aparezca, en los términos del numeral 9.

[informacion] Información del centro (opcional). Acepto recibir información de eventos, torneos y promociones por WhatsApp o correo. Puedo retirar esta autorización cuando quiera escribiendo a centrodeportivoaf@gmail.com.$texto$,
  '', null
);

do $$
declare
  v_viejo text;
  v_nuevo text;
begin
  select texto into strict v_viejo from public.consentimiento_version where codigo = 'reglamento-2026-10-v2';
  v_nuevo := replace(v_viejo,
    $a$Esta autorización es voluntaria. Quien no la otorgue puede participar igual en todas las actividades, y quien la haya otorgado puede retirarla en cualquier momento escribiendo a centrodeportivoaf@gmail.com.$a$,
    $a$Esta autorización es una condición para participar en las clases y actividades del Centro, porque en ellas se toman fotografías y videos de grupo. Quien la haya otorgado puede revocarla escribiendo a centrodeportivoaf@gmail.com; en ese caso, el Centro no publicará material nuevo en el que el usuario aparezca de forma individual y retirará, cuando sea posible, las publicaciones en las que aparezca.$a$);
  if v_nuevo = v_viejo then
    raise exception 'El artículo 22 del reglamento-2026-10-v2 no tiene el párrafo esperado';
  end if;
  insert into public.consentimiento_version (codigo, publico, titulo, texto, texto_sha256, vigente_desde)
  select 'reglamento-2026-10-v3', publico, titulo, v_nuevo, '', null
    from public.consentimiento_version where codigo = 'reglamento-2026-10-v2';
end;
$$;
