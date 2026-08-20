-- ============================================================================
-- 0072 · Matrículas de academia como categoría propia
-- ----------------------------------------------------------------------------
-- El club quiere leer por separado cuánto entra por MATRÍCULA y cuánto por las
-- clases de academia. Siigo NO lo trae separado: verificado contra su API, la
-- matrícula (AF209) y la mensualidad (AF297) comparten el mismo `account_group`
-- (id 2008 · "Academia recreativa tenis"), el mismo `type` (Service) y la misma
-- `tax_classification`. Ningún campo de Siigo las distingue.
--
-- Lo único que las separa es el CÓDIGO del producto, y es señal confiable en los
-- dos sentidos (medido sobre todo el histórico):
--   · ninguna matrícula se cobra con otro código  → 0 fugas
--   · AF209/AF184 nunca se usan para otra cosa    → sus 128 líneas dicen MATRÍCULA
--
-- Por eso el catálogo aprende a reclamar CÓDIGOS además de grupos, y el código le
-- gana al grupo. Es la excepción, no la regla: el resto sigue casando por grupo.
--
-- ⚠️ Las matrículas de COMPETENCIA se cobran con estos mismos códigos (confirmado
-- con el club, ago-2026): no existe un producto de matrícula aparte para
-- competencia. Por eso las categorías son por DEPORTE ("Matrícula Tenis" /
-- "Matrícula Pádel") y no por academia — cada una cubre recreativa + competencia.
-- ============================================================================

alter table public.servicios add column if not exists siigo_codigos text[];

comment on column public.servicios.siigo_codigos is
  'Códigos de producto de Siigo que este servicio reclama por encima de su grupo. '
  'Para excepciones donde el account_group no alcanza (ej. matrícula y mensualidad '
  'comparten grupo). El sync mira primero el código y solo después el grupo.';

-- Índice GIN: el sync pregunta "¿qué servicio reclama este código?" en cada corrida.
create index if not exists servicios_siigo_codigos_idx
  on public.servicios using gin (siigo_codigos);

-- Colores: NO se eligieron a ojo. Salieron del validador de paleta (ΔE en OKLab con
-- daltonismo protan/deutan simulado): entre sí ΔE 29,6 y peor par contra los 7 que
-- pelean el top-5 de la dona ΔE 8,8 (umbral 8). Al de tenis, que es el grande, le
-- toca el mejor separado. Ver la regla de colores en MEMORIA.md.
insert into public.servicios (clave, nombre, color, categoria_saldo, siigo_grupo, siigo_codigos, orden)
values
  ('matricula_tenis', 'Matrícula Tenis', '#463dc3', 'academia', null, array['AF209'], 81),
  ('matricula_padel', 'Matrícula Pádel', '#1ebdca', 'academia', null, array['AF184'], 82)
on conflict (clave) do update
  set nombre = excluded.nombre,
      color = excluded.color,
      categoria_saldo = excluded.categoria_saldo,
      siigo_codigos = excluded.siigo_codigos;

-- ── Recategorización retroactiva (decisión de Laura: todo el histórico) ──
-- Así "mes vs mes anterior" compara cifras equivalentes. Se hace aquí y no se deja
-- al sync porque el sync solo reescribe líneas de facturas que vuelve a traer.
update public.siigo_productos p
set servicio_id = s.id
from public.servicios s
where s.siigo_codigos is not null
  and p.codigo = any (s.siigo_codigos);

update public.siigo_factura_lineas l
set servicio_id = s.id
from public.servicios s
where s.siigo_codigos is not null
  and l.codigo = any (s.siigo_codigos)
  and l.servicio_id is distinct from s.id;
