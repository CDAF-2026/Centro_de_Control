-- ============================================================================
-- Carga inicial de la carta de la cafetería (20-nov-2026)
--
-- Generada desde `Precios_Siigo_Cafeteria.xlsx` (hoja "Encontrados", corte de
-- Siigo del 19-nov-2026, que pasó Laura): 121 productos con precio, disponibles.
--
-- La carta trae SOLO lo de ese Excel (Laura, 20-nov-2026). En la primera versión
-- entraron además 16 productos de la carta impresa sin precio y apagados; ella
-- pidió quitarlos ese mismo día y se borraron de la base (rastro en `audit_log`,
-- `cafeteria.producto.eliminar`).
--
-- Las categorías las armé yo por tipo de producto (el Excel no trae); se pueden
-- renombrar, reordenar y mover desde el panel.
-- Solo corre si la carta está vacía, para no duplicar nada.
-- ============================================================================
do $$
begin
  if exists (select 1 from public.cafeteria_productos) or exists (select 1 from public.cafeteria_categorias) then
    raise notice 'La carta ya tiene datos: no se carga nada.';
    return;
  end if;

  insert into public.cafeteria_categorias (nombre, orden) values
    ('Entradas', 1),
    ('Platos fuertes', 2),
    ('Café y bebidas calientes', 3),
    ('Bebidas frías', 4),
    ('Cervezas', 5),
    ('Mekato', 6),
    ('Dulces y postres', 7),
    ('Frutas y saludable', 8);

  insert into public.cafeteria_productos (categoria_id, nombre, precio, opciones, disponible)
  select c.id, v.nombre, v.precio, v.opciones, v.disponible
  from (values
    ('Mekato', 'Maní arándanos', 4000, '{}'::text[], true),
    ('Mekato', 'Maní salado', 3500, '{}'::text[], true),
    ('Mekato', 'Maní limón', 4000, '{}'::text[], true),
    ('Mekato', 'Maní moto', 4000, '{}'::text[], true),
    ('Mekato', 'Maní pasas', 3500, '{}'::text[], true),
    ('Mekato', 'Chokis bola de chocolate', 3000, '{}'::text[], true),
    ('Mekato', 'Chokis clásica (galleta)', 4500, '{}'::text[], true),
    ('Mekato', 'Chokis Black (galleta)', 4500, '{}'::text[], true),
    ('Mekato', 'Chokis chocolate (galleta)', 4500, '{}'::text[], true),
    ('Mekato', 'Quaker frutos rojos', 3000, '{}'::text[], true),
    ('Mekato', 'Quaker granola y ajonjolí', 3000, '{}'::text[], true),
    ('Mekato', 'Quaker pasas y chía', 3000, '{}'::text[], true),
    ('Mekato', 'Mamut blanca', 1000, '{}'::text[], true),
    ('Mekato', 'Mamut chocolate', 1000, '{}'::text[], true),
    ('Mekato', 'Cheetos', 5000, '{}'::text[], true),
    ('Mekato', 'Margarita receta clásica', 6500, '{}'::text[], true),
    ('Mekato', 'Margarita de pollo', 5000, '{}'::text[], true),
    ('Mekato', 'Margarita natural', 5000, '{}'::text[], true),
    ('Mekato', 'Margarita de limón', 5000, '{}'::text[], true),
    ('Mekato', 'Onduladas mayonesa', 6000, '{}'::text[], true),
    ('Mekato', 'Boliquesos', 5000, '{}'::text[], true),
    ('Mekato', 'Choclito', 4500, '{}'::text[], true),
    ('Mekato', 'Doritos mega queso', 5500, '{}'::text[], true),
    ('Mekato', 'Natu chips verde', 5000, '{}'::text[], true),
    ('Mekato', 'Natu chips maduro', 5000, '{}'::text[], true),
    ('Mekato', 'De todito natural', 6500, '{}'::text[], true),
    ('Mekato', 'De todito BBQ', 6500, '{}'::text[], true),
    ('Mekato', 'De todito limón Flamin hot', 6500, '{}'::text[], true),
    ('Mekato', 'Doritos dinamita limón', 7000, '{}'::text[], true),
    ('Mekato', 'Tostacos picante', 3500, '{}'::text[], true),
    ('Mekato', 'Maizitos natural', 3500, '{}'::text[], true),
    ('Mekato', 'Maizitos arepas', 3500, '{}'::text[], true),
    ('Mekato', 'Achiras', 3000, '{}'::text[], true),
    ('Dulces y postres', 'Gala', 4000, '{}'::text[], true),
    ('Dulces y postres', 'Chocorramo miti', 2000, '{}'::text[], true),
    ('Dulces y postres', 'Ramo brownie', 2000, '{}'::text[], true),
    ('Dulces y postres', 'Gansito', 4000, '{}'::text[], true),
    ('Dulces y postres', 'Esquinas de chocorramo', 4500, '{}'::text[], true),
    ('Dulces y postres', 'Ponqué Ramo', 1000, '{}'::text[], true),
    ('Mekato', 'Plátano verde limón', 11000, '{}'::text[], true),
    ('Mekato', 'Plátano verde natural', 11000, '{}'::text[], true),
    ('Mekato', 'Plátano maduro', 11000, '{}'::text[], true),
    ('Mekato', 'Plátano maduro limón', 11000, '{}'::text[], true),
    ('Mekato', 'Yucas naturales', 11000, '{}'::text[], true),
    ('Mekato', 'Papas de pimienta limón', 11000, '{}'::text[], true),
    ('Mekato', 'Papas de limón', 11000, '{}'::text[], true),
    ('Mekato', 'Papas naturales', 11000, '{}'::text[], true),
    ('Bebidas frías', 'Gatorade frutos tropicales', 8000, '{}'::text[], true),
    ('Bebidas frías', 'Gatorade blue ice', 8000, '{}'::text[], true),
    ('Bebidas frías', 'Gatorade maracuyá', 8000, '{}'::text[], true),
    ('Bebidas frías', 'Gatorade mandarina', 8000, '{}'::text[], true),
    ('Bebidas frías', 'Gatorade fresa kiwi zero', 8000, '{}'::text[], true),
    ('Bebidas frías', 'Gatorade naranja zero', 8000, '{}'::text[], true),
    ('Bebidas frías', 'Gatorlit coco', 8000, '{}'::text[], true),
    ('Bebidas frías', 'Gatorlit moras', 8000, '{}'::text[], true),
    ('Bebidas frías', 'Gatorlit uva', 8000, '{}'::text[], true),
    ('Bebidas frías', 'Gatorlit fresas kiwi', 8000, '{}'::text[], true),
    ('Bebidas frías', 'Gatorlit blue ice', 8000, '{}'::text[], true),
    ('Bebidas frías', 'Agua Cristal 600', 4000, '{}'::text[], true),
    ('Bebidas frías', 'Agua Cristal 300', 2000, '{}'::text[], true),
    ('Bebidas frías', 'Agua con gas 600', 5000, '{}'::text[], true),
    ('Bebidas frías', 'Bretaña', 5500, '{}'::text[], true),
    ('Bebidas frías', 'H2O lima limón', 5500, '{}'::text[], true),
    ('Bebidas frías', 'H2O maracuyá', 5500, '{}'::text[], true),
    ('Bebidas frías', 'Hit cajita mora', 3000, '{}'::text[], true),
    ('Bebidas frías', 'Hit cajita mango', 3000, '{}'::text[], true),
    ('Bebidas frías', 'Hatsu lila', 8000, '{}'::text[], true),
    ('Bebidas frías', 'Hatsu amarillo', 8000, '{}'::text[], true),
    ('Bebidas frías', 'Hatsu negro', 8000, '{}'::text[], true),
    ('Bebidas frías', 'Hatsu blanco', 8000, '{}'::text[], true),
    ('Bebidas frías', 'Gaseosa Colombiana', 4000, '{}'::text[], true),
    ('Bebidas frías', 'Gaseosa Manzana', 4000, '{}'::text[], true),
    ('Bebidas frías', 'Mr Tea durazno', 5500, '{}'::text[], true),
    ('Bebidas frías', 'Mr Tea limón', 5500, '{}'::text[], true),
    ('Bebidas frías', 'Red Bull', 11000, '{}'::text[], true),
    ('Bebidas frías', 'Red Bull sin azúcar', 11000, '{}'::text[], true),
    ('Cervezas', 'Cerveza Mítica', 8000, '{}'::text[], true),
    ('Cervezas', 'Cerveza Mítica ligera', 8000, '{}'::text[], true),
    ('Cervezas', '3 Cordilleras mestiza', 8000, '{}'::text[], true),
    ('Cervezas', '3 Cordilleras rosada', 8000, '{}'::text[], true),
    ('Cervezas', 'Heineken lata', 6000, '{}'::text[], true),
    ('Cervezas', 'Heineken lata zero', 6000, '{}'::text[], true),
    ('Cervezas', 'Stella Artois', 9000, '{}'::text[], true),
    ('Cervezas', 'Costeñita', 5500, '{}'::text[], true),
    ('Cervezas', 'Coronita', 6000, '{}'::text[], true),
    ('Cervezas', 'Club Dorada lata', 7000, '{}'::text[], true),
    ('Cervezas', 'La Jovencita', 16000, '{}'::text[], true),
    ('Cervezas', 'Niño sin padre', 16000, '{}'::text[], true),
    ('Bebidas frías', 'Coca-Cola original lata', 6000, '{}'::text[], true),
    ('Bebidas frías', 'Coca-Cola zero lata', 6000, '{}'::text[], true),
    ('Bebidas frías', 'Coca-Cola original botella', 5500, '{}'::text[], true),
    ('Bebidas frías', 'Coca-Cola zero botella', 5500, '{}'::text[], true),
    ('Bebidas frías', 'Quatro', 5000, '{}'::text[], true),
    ('Café y bebidas calientes', 'Capuchino', 7000, '{}'::text[], true),
    ('Café y bebidas calientes', 'Chocolate La Abuela', 8000, '{}'::text[], true),
    ('Café y bebidas calientes', 'Milo máquina', 8000, '{}'::text[], true),
    ('Café y bebidas calientes', 'Milo', 8000, array['Frío', 'Caliente']::text[], true),
    ('Entradas', 'Palitos de queso', 3000, '{}'::text[], true),
    ('Entradas', 'Pandebono', 5000, '{}'::text[], true),
    ('Entradas', 'Empanadas', 2000, '{}'::text[], true),
    ('Entradas', 'Pastel de pollo', 4000, '{}'::text[], true),
    ('Platos fuertes', 'Pizzas', 32000, '{}'::text[], true),
    ('Platos fuertes', 'Carne chata', 40000, '{}'::text[], true),
    ('Platos fuertes', 'Chuzos', 30000, '{}'::text[], true),
    ('Platos fuertes', 'Pollo', 30000, '{}'::text[], true),
    ('Platos fuertes', 'Pastas', 26000, '{}'::text[], true),
    ('Frutas y saludable', 'Yogurt griego', 10000, '{}'::text[], true),
    ('Café y bebidas calientes', 'Leche deslactosada', 2000, '{}'::text[], true),
    ('Entradas', 'Papas francesas', 4000, '{}'::text[], true),
    ('Bebidas frías', 'Jugos naturales', 8000, array['Mango', 'Mora', 'Fresa', 'Guanábana', 'Maracuyá']::text[], true),
    ('Frutas y saludable', 'Banano', 2000, '{}'::text[], true),
    ('Frutas y saludable', 'Manzana roja', 4000, '{}'::text[], true),
    ('Frutas y saludable', 'Manzana verde', 4000, '{}'::text[], true),
    ('Frutas y saludable', 'Mangos', 10000, '{}'::text[], true),
    ('Frutas y saludable', 'Naranja', 4500, '{}'::text[], true),
    ('Frutas y saludable', 'Mandarinas', 2000, '{}'::text[], true),
    ('Bebidas frías', 'Proteína', 16000, '{}'::text[], true),
    ('Dulces y postres', 'Brownies', 1500, '{}'::text[], true),
    ('Dulces y postres', 'Alfajores', 4000, '{}'::text[], true),
    ('Dulces y postres', 'Torta', 14000, '{}'::text[], true),
    ('Mekato', 'Rosquitas', 6000, '{}'::text[], true)
  ) as v(categoria, nombre, precio, opciones, disponible)
  join public.cafeteria_categorias c on c.nombre = v.categoria;
end $$;
