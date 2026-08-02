-- Colores del catálogo de servicios: que se distingan de verdad.
--
-- El club reportó que "los azules y los grises no se diferencian". La causa no era
-- que fueran parecidos: CINCO grupos de servicios compartían EL MISMO hex, así que
-- eran literalmente indistinguibles (ΔE 0,0). Medido sobre la facturación real:
--   #3e6280 -> Clases de tenis (3º del club por plata) + Clases de pádel (4º) + Clase particular
--   #37474f -> Academia Recreativa Tenis (2º) + Academia Recreativa Pádel (8º)
--   #8aa0a8 -> Alquiler tenis + Alquiler pádel + Alquiler
--   #b591e0 -> Patrocinio (1º) + Torneo + Patrocinio torneo
--   #5c6bc0 -> Academia Competencia Tenis + Alto rendimiento Joaquín
--   #c8ccc4 -> Otro + Comisión punto de entrega
-- Encima, los azules/grises viejos tenían croma < 0,07: por debajo de ~0,10 un tono
-- deja de leerse como color y el ojo lo procesa como gris. Y #37474f (L 0,39) y
-- #c8ccc4 (L 0,84) quedaban fuera de la banda de luminosidad utilizable.
--
-- Los nuevos se ELIGIERON CON EL VALIDADOR, no a ojo (distancia ΔE en OKLab, con
-- daltonismo protan/deutan simulado). Dos niveles a propósito:
--
--  · Los SIETE que pelean el top-5 de la dona (medido mes a mes sobre jun–ago 2026)
--    pasan "todos contra todos": cualquier tajada contra cualquier otra.
--    Peor par ΔE 9,2 con daltonismo y 17,7 con visión normal (pisos: 8 y 15).
--  · El resto va siempre DENTRO de "Otros" en la dona y solo aparece en listados
--    donde cada fila lleva su nombre y su cifra, así que el color refuerza pero no
--    carga solo la identidad. Ahí el listón es más bajo a propósito.
--
-- ⚠️ Son 22 servicios y el espacio de color no da para 22 identidades separadas:
-- pasadas ~9 no existe ningún color en todo el espectro que se despegue de los
-- anteriores. Por eso la dona corta en 5 + "Otros" y por eso la cola va etiquetada.
-- Al agregar un servicio nuevo NO inventar un hex: revisar contra esta lista.
--
-- Se hace por migración porque /config quedó en solo lectura (31-jul-2026).

-- ── Los 7 de la dona (validados todos contra todos) ──
update servicios set color = '#295a8e' where clave = 'academia_tenis';          -- azul petróleo (heredero del charcoal)
update servicios set color = '#00a0d0' where clave = 'clases_tenis';            -- cian
update servicios set color = '#8e3255' where clave = 'clases_padel';            -- vino
update servicios set color = '#c4962b' where clave = 'cafeteria';               -- ámbar (conserva su identidad)
update servicios set color = '#8b5fd6' where clave = 'patrocinio';              -- morado (conserva su identidad)
update servicios set color = '#667900' where clave = 'alquiler_padel';          -- oliva
update servicios set color = '#d16e8f' where clave = 'vacacionales';            -- rosa

-- ── La cola: apagados a propósito, siempre acompañados de su etiqueta ──
update servicios set color = '#3f8f84' where clave = 'academia_padel';          -- verde azulado
update servicios set color = '#6b4fa0' where clave = 'alto_rendimiento_tenis';  -- violeta oscuro
update servicios set color = '#a3789b' where clave = 'alto_rendimiento_padel';  -- malva
update servicios set color = '#9a86c4' where clave = 'alto_rendimiento_joaquin';-- violeta claro
update servicios set color = '#5f6f8a' where clave = 'clase_particular';        -- azul pizarra
update servicios set color = '#a08a3c' where clave = 'alquiler_tenis';          -- mostaza
update servicios set color = '#87906b' where clave = 'alquiler';                -- verde seco
update servicios set color = '#4a3f7a' where clave = 'torneo';                  -- morado profundo
update servicios set color = '#ab93da' where clave = 'patrocinio_torneo';       -- lila
update servicios set color = '#9c6b4a' where clave = 'almacen';                 -- terracota
update servicios set color = '#2f8fa8' where clave = 'preparacion_fisica';      -- azul verdoso
update servicios set color = '#5d8f52' where clave = 'convenios_colegios';      -- verde
update servicios set color = '#7b8fa8' where clave = 'paquete';                 -- azul gris
update servicios set color = '#b9bdb6' where clave = 'otro';                    -- neutro
update servicios set color = '#7e8378' where clave = 'comision_entrega';        -- neutro oscuro

-- `paquete` salía en lima #d4e157, que es el color de marca reservado para
-- acción/estado (regla del sistema de diseño); pasa a azul gris.

do $$
declare n int;
begin
  select count(*) into n from (select color from servicios group by color having count(*) > 1) d;
  if n > 0 then raise exception 'quedaron % colores repetidos en servicios', n; end if;
end $$;
