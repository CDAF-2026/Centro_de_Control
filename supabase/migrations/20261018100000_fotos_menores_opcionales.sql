-- ============================================================================
-- Fotos y videos de MENORES vuelven a ser opcionales, con su propia casilla (Laura y el club, 18-oct-2026)
-- ----------------------------------------------------------------------------
-- Paso atrás en lo de las fotos, solo para niños: el papá decide con una casilla (sin marcar al entrar).
-- Si no autoriza, la plataforma avisa al club por correo (centrodeportivoaf@gmail.com) y el correo al papá
-- lo menciona.
--   · 2026-10-v5 (menores): igual a 2026-10-v4 salvo
--       - numeral 9: vuelve a la redacción que el abogado aprobó en 2026-10-v2 ("Solo si lo autorizo abajo…
--         Si no lo autorizo, mi hijo(a) puede participar igual…");
--       - bloque AUTORIZACIÓN: las fotos salen de lo que se acepta al firmar (queda (a) datos y (b) información
--         del centro) y vuelven como opción [imagen], con el texto que pidió Laura.
--   · reglamento-2026-10-v4: art. 22, 2.º párrafo, con una frase neutra que sirve para adultos (fotos
--     incluidas al firmar) y para menores (opcional): "La autorización se otorga en el consentimiento informado, en los términos que este indique." (aprobada por Laura).
-- Adultos no cambian (2026-10-adultos-v5 sigue vigente). Academias no cambia.
-- EN PREPARACIÓN; se abren en una migración aparte después de desplegar el código.
-- ============================================================================

insert into public.consentimiento_version (codigo, publico, titulo, texto, texto_sha256, vigente_desde) values
(
  '2026-10-v5', 'menores',
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

9. Fotografías y videos. Solo si lo autorizo abajo, el centro podrá usar fotos y videos en los que aparezca mi hijo(a), tomados durante clases, torneos y eventos, únicamente en su página web, sus redes sociales y su material impreso, para mostrar sus actividades. El uso es gratuito, no se cederá a terceros con fines comerciales y no se publicará su nombre completo ni datos que permitan ubicarlo. Si no lo autorizo, mi hijo(a) puede participar igual en todas las actividades. Puedo retirar esta autorización en cualquier momento escribiendo a centrodeportivoaf@gmail.com.

10. Declaración final. Con mi firma declaro que leí y entendí este documento, que conozco el Reglamento General del centro y que acepto los riesgos propios de la práctica deportiva en nombre del menor que represento. Entiendo que el CENTRO DEPORTIVO ALEJANDRO FALLA no responde por lesiones derivadas de esos riesgos propios del deporte, salvo cuando se deban a dolo o culpa grave del centro, de su personal o de las condiciones de sus instalaciones.

AUTORIZACIÓN

Con mi firma acepto el consentimiento informado, el Reglamento General y el Reglamento de las Academias de Tenis y Pádel del CENTRO DEPORTIVO AF, y autorizo: (a) el tratamiento de los datos personales de mi hijo(a) para las finalidades del numeral 8, incluidos la EPS y el RH si los entrego, solo para atender emergencias; y (b) recibir información de eventos, torneos y promociones del centro por WhatsApp o correo. Puedo pedir en cualquier momento que no me envíen más esta información escribiendo a centrodeportivoaf@gmail.com.

[imagen] Fotos y videos. Autorizo al centro a usar fotos y videos de mi hijo(a) en su página web, sus redes sociales y su material impreso, como se indica en el numeral 9.$texto$,
  '', null
);

do $$
declare
  v_viejo text;
  v_nuevo text;
begin
  select texto into strict v_viejo from public.consentimiento_version where codigo = 'reglamento-2026-10-v3';
  v_nuevo := replace(v_viejo,
    $a$Esta autorización es una condición para participar en las clases y actividades del Centro, porque en ellas se toman fotografías y videos de grupo. Quien la haya otorgado puede revocarla escribiendo a centrodeportivoaf@gmail.com; en ese caso, el Centro no publicará material nuevo en el que el usuario aparezca de forma individual y retirará, cuando sea posible, las publicaciones en las que aparezca.$a$,
    $a$La autorización se otorga en el consentimiento informado, en los términos que este indique.$a$);
  if v_nuevo = v_viejo then
    raise exception 'El artículo 22 del reglamento-2026-10-v3 no tiene el párrafo esperado';
  end if;
  insert into public.consentimiento_version (codigo, publico, titulo, texto, texto_sha256, vigente_desde)
  select 'reglamento-2026-10-v4', publico, titulo, v_nuevo, '', null
    from public.consentimiento_version where codigo = 'reglamento-2026-10-v3';
end;
$$;
