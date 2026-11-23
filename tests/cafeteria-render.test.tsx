import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createClient as sbClient } from "@supabase/supabase-js";

/**
 * Las pantallas de la cafetería, renderizadas de verdad contra la base (mismo
 * arnés que `paquetes-render`): el panel `/cafeteria`, el historial
 * `/cafeteria/pedidos` y la carta pública `/carta`.
 *
 * ⚠️ La carta la mueve el club todos los días (prende, apaga, agrega). Por eso
 * ninguna prueba nombra un producto fijo: lo que se compara sale de una consulta
 * hecha en la misma prueba, o se monta la pieza suelta con props.
 */

let PERFIL = { id: "00000000-0000-0000-0000-000000000000", role: "superadmin", nombre: "test", activo: true, marca_turno: false };

vi.mock("@/lib/auth", () => ({
  requireRole: async () => PERFIL,
  requireProfile: async () => PERFIL,
  getProfile: async () => PERFIL,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => admin() }));
vi.mock("next/cache", () => ({ refresh: () => {}, revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...r }: any) => React.createElement("a", { href: String(href), ...r }, children),
}));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NOT_FOUND"); },
  redirect: (u: string) => { throw new Error("REDIRECT " + u); },
  // La pantalla de pedidos se refresca sola (`AlDia`): al renderizar en la prueba no hace nada.
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
}));
vi.mock("next/image", () => ({
  default: (p: any) => React.createElement("img", { src: p.src, alt: p.alt }),
}));

const admin = () =>
  sbClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
const texto = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const veces = (html: string, trozo: string) => html.split(trozo).length - 1;
/** Como React escribe un texto dentro de una etiqueta. */
const escapar = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

const CATEGORIAS = [{ id: 1, nombre: "Bebidas", orden: 1 }];
const producto = (extra: object = {}) => ({
  id: 7, categoriaId: 1, nombre: "Limonada de prueba", descripcion: null as string | null, precio: 8000,
  opciones: [] as string[], fotoPath: null as string | null, fotoUrl: null as string | null, disponible: true, ...extra,
});

describe("/cafeteria · el panel", () => {
  it("pinta la carta completa: cifras, categorías y una tarjeta con interruptor y lápiz por producto", async () => {
    PERFIL = { ...PERFIL, role: "superadmin" };
    const { count } = await admin().from("cafeteria_productos").select("id", { count: "exact", head: true });
    const { default: Page } = await import("../src/app/(app)/cafeteria/page");
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }));
    const t = texto(html);

    expect(t).toContain("Cafetería");
    expect(t).toContain("Categorías");
    expect(t).toContain("Ver como comprador");
    expect(t).toContain("Sin foto");
    expect(html).toContain('href="/cafeteria/producto/nuevo"');
    // Cada producto de la base, disponible o no, sale con su interruptor y su lápiz.
    expect(count).toBeGreaterThan(0);
    expect(veces(html, 'role="switch"')).toBe(count);
    expect(veces(html, 'aria-label="Editar ')).toBe(count);
    // El superadministrador puede cambiar el WhatsApp a donde llegan los pedidos.
    expect(t).toMatch(/Cambiar el número|Poner el número/);
  });

  it("al escoger una categoría en la columna, solo salen sus productos y «Nuevo producto» la conserva", async () => {
    const { data } = await admin().from("cafeteria_productos").select("categoria_id");
    const porCategoria = new Map<number, number>();
    for (const p of data ?? []) porCategoria.set(p.categoria_id, (porCategoria.get(p.categoria_id) ?? 0) + 1);
    const [categoria, cuantos] = [...porCategoria.entries()][0];

    const { default: Page } = await import("../src/app/(app)/cafeteria/page");
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ categoria: String(categoria) }) }));
    expect(veces(html, 'role="switch"')).toBe(cuantos);
    expect(html).toContain(`href="/cafeteria/producto/nuevo?categoria=${categoria}"`);
    // La columna sigue mostrando TODAS las categorías: es por donde se cambia de una a otra.
    expect(veces(html, 'href="/cafeteria?categoria=')).toBe(porCategoria.size);
  });

  it("recepción administra la carta pero NO cambia el WhatsApp a donde llegan los pedidos", async () => {
    PERFIL = { ...PERFIL, role: "recepcion" };
    const { default: Page } = await import("../src/app/(app)/cafeteria/page");
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }));
    expect(html).toContain('href="/cafeteria/producto/nuevo"');
    expect(html).toContain('role="switch"');
    expect(texto(html)).not.toMatch(/Cambiar el número|Poner el número/);
    expect(texto(html)).toContain("Lo cambian el superadministrador o la coordinación administrativa");
    PERFIL = { ...PERFIL, role: "superadmin" };
  });

  it("un producto sin precio lo dice, y su interruptor está apagado", async () => {
    const { ProductoTarjeta } = await import("../src/app/(app)/cafeteria/carta-admin");
    const html = renderToStaticMarkup(<ul><ProductoTarjeta producto={producto({ precio: 0, disponible: false })} puedeEditar /></ul>);
    expect(texto(html)).toContain("Sin precio");
    expect(texto(html)).toContain("No disponible");
    expect(html).toContain('aria-checked="false"');
    expect(html).toContain("Ponle el precio antes de dejarlo disponible");
  });

  it("un producto disponible muestra su foto, precio y opciones, y el lápiz lleva a su editor", async () => {
    const { ProductoTarjeta } = await import("../src/app/(app)/cafeteria/carta-admin");
    const html = renderToStaticMarkup(
      <ul><ProductoTarjeta producto={producto({ opciones: ["Frío", "Caliente"], fotoUrl: "https://x.test/f.jpg" })} puedeEditar /></ul>,
    );
    const t = texto(html);
    expect(t).toContain("$8.000");
    expect(t).toContain("Frío · Caliente");
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('src="https://x.test/f.jpg"');
    expect(html).toContain('href="/cafeteria/producto/7"');
    expect(html).toContain('aria-label="Editar Limonada de prueba"');
  });

  it("el lápiz le dice al editor de qué categoría se vino, para volver ahí al guardar", async () => {
    const { ProductoTarjeta } = await import("../src/app/(app)/cafeteria/carta-admin");
    const html = renderToStaticMarkup(<ul><ProductoTarjeta producto={producto()} puedeEditar de={4} /></ul>);
    expect(html).toContain('href="/cafeteria/producto/7?de=4"');
  });

  it("al volver del editor, la rejilla dice qué se guardó (el editor ya no se queda abierto)", async () => {
    const { data: p } = await admin().from("cafeteria_productos").select("id, nombre").limit(1).single();
    const { default: Page } = await import("../src/app/(app)/cafeteria/page");
    const guardado = texto(renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ hecho: "guardado", p: String(p!.id) }) })));
    expect(guardado).toContain(`Guardaste los cambios de «${p!.nombre}».`);
    const creado = texto(renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ hecho: "creado", p: String(p!.id) }) })));
    expect(creado).toContain(`Agregaste «${p!.nombre}» a la carta.`);
    const eliminado = texto(renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ hecho: "eliminado", n: "Producto viejo" }) })));
    expect(eliminado).toContain("Eliminaste «Producto viejo» de la carta.");
    // Sin nada que avisar (o con un producto que no existe), no hay aviso.
    const nada = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ hecho: "guardado", p: "0" }) }));
    expect(nada).not.toContain('role="status"');
  });
});

describe("/cafeteria/producto · el editor con la vista del comprador", () => {
  it("«Nuevo producto» abre el editor vacío, con el campo de foto y el celular de vista previa", async () => {
    const { default: Page } = await import("../src/app/(app)/cafeteria/producto/nuevo/page");
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }));
    const t = texto(html);
    expect(t).toContain("Nuevo producto");
    expect(t).toContain("Agregar producto");
    expect(t).toContain("Así lo ve el comprador");
    // La foto se sube con un campo de archivo, desde el computador o el celular.
    expect(html).toContain('type="file"');
    expect(html).toContain('name="foto"');
    expect(html).toContain('name="precio"');
    // Un producto nuevo arranca disponible, pero sin precio la vista avisa que no saldrá.
    expect(t).toContain("Sin precio no aparece en la carta.");
    expect(t).not.toContain("Eliminar producto");
  });

  it("el lápiz de un producto real abre su editor con sus datos", async () => {
    const { data: p } = await admin().from("cafeteria_productos").select("id, nombre, precio").gt("precio", 0).limit(1).single();
    const { default: Page } = await import("../src/app/(app)/cafeteria/producto/[id]/page");
    const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ id: String(p!.id) }), searchParams: Promise.resolve({}) }));
    expect(html).toContain(`value="${escapar(p!.nombre)}"`);
    expect(html).toContain(`value="${p!.precio}"`);
    expect(texto(html)).toContain("Guardar cambios");
    expect(texto(html)).toContain("Eliminar producto");
  });

  it("el celular muestra el producto con sus opciones, resaltado entre los de su categoría", async () => {
    const { ProductoEditor } = await import("../src/app/(app)/cafeteria/producto-editor");
    const vecino = producto({ id: 8, nombre: "Agua de prueba", precio: 4000 });
    const editado = producto({ descripcion: "Con hierbabuena", opciones: ["Con azúcar", "Sin azúcar"] });
    const html = renderToStaticMarkup(<ProductoEditor categorias={CATEGORIAS} productos={[vecino, editado]} producto={editado} volverA={1} />);
    const t = texto(html);
    expect(html).toContain('value="Limonada de prueba"');
    expect(html).toContain('value="8000"');
    expect(html).toContain('value="Con hierbabuena"');
    expect(t).toContain("Disponible en la carta");
    expect(t).toContain("Volver a Bebidas");
    // En el celular: el vecino, y el producto editado con su descripción y sus dos opciones.
    const celular = t.slice(t.indexOf("Así lo ve el comprador"));
    expect(celular).toContain("Agua de prueba");
    expect(celular).toContain("Limonada de prueba");
    expect(celular).toContain("Con hierbabuena");
    expect(celular).toContain("Con azúcar");
    expect(celular).toContain("Sin azúcar");
    expect(celular).toContain("$8.000");
  });

  it("un producto no disponible NO sale en el celular, y se dice por qué", async () => {
    const { ProductoEditor } = await import("../src/app/(app)/cafeteria/producto-editor");
    const vecino = producto({ id: 8, nombre: "Agua de prueba", precio: 4000 });
    const apagado = producto({ disponible: false });
    const html = renderToStaticMarkup(<ProductoEditor categorias={CATEGORIAS} productos={[vecino, apagado]} producto={apagado} volverA={null} />);
    const celular = texto(html).slice(texto(html).indexOf("Así lo ve el comprador"));
    expect(celular).toContain("Agua de prueba");
    expect(celular).not.toContain("Limonada de prueba");
    expect(celular).toContain("Está como no disponible: el comprador no lo ve.");
  });

  it("al llegar recién creado con un aviso (la foto no subió), el editor lo muestra", async () => {
    const { ProductoEditor } = await import("../src/app/(app)/cafeteria/producto-editor");
    const p = producto();
    const html = renderToStaticMarkup(<ProductoEditor categorias={CATEGORIAS} productos={[p]} producto={p} volverA={null} aviso="foto" />);
    expect(texto(html)).toContain("la foto no se pudo subir");
  });
});

describe("/cafeteria/pedidos · por atender e historial", () => {
  it("abre en las dos listas y en los tres periodos del historial, y avisa que un pedido aquí no prueba que llegó a WhatsApp", async () => {
    const { default: Page } = await import("../src/app/(app)/cafeteria/pedidos/page");
    const vistas = [{}, { ver: "historial" }, { ver: "historial", periodo: "semana" }, { ver: "historial", periodo: "todos" }];
    for (const sp of vistas) {
      const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve(sp) }));
      const t = texto(html);
      const cual = JSON.stringify(sp);
      expect(t, cual).toContain("Por atender");
      expect(t, cual).toContain("Historial");
      expect(t, cual).toContain("por atender hoy");
      expect(t, cual).toContain("el chat de WhatsApp sigue siendo el que manda");
      expect(t, cual).toContain("se actualiza sola");
      expect(t, cual).not.toContain("No se pudieron cargar los pedidos");
    }
  });

  it("la lista por atender trae SOLO lo de hoy que sigue pendiente o en preparación; el resto está en el historial", async () => {
    const { hoyBogota, isoDia } = await import("../src/lib/periodo");
    const inicioHoy = new Date(`${isoDia(hoyBogota())}T00:00:00-05:00`).toISOString();
    const { data } = await admin().from("cafeteria_pedidos").select("id, recibido_el, estado");
    const todos = data ?? [];
    const abiertos = todos.filter((p) => p.recibido_el >= inicioHoy && ["pendiente", "en_preparacion"].includes(p.estado));

    const { default: Page } = await import("../src/app/(app)/cafeteria/pedidos/page");
    const atender = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }));
    const historial = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ ver: "historial", periodo: "todos" }) }));
    // Cada tarjeta lleva su id en un campo oculto del formulario de estado.
    const ids = (html: string) => [...new Set([...html.matchAll(/name="id" value="(\d+)"/g)].map((m) => Number(m[1])))].sort((a, b) => a - b);
    expect(ids(atender)).toEqual(abiertos.map((p) => p.id).sort((a, b) => a - b));
    const cerrados = todos.filter((p) => !abiertos.includes(p)).map((p) => p.id).sort((a, b) => a - b);
    // El historial va de a 30 por página: con más de eso, la primera página es parte de los cerrados.
    if (cerrados.length <= 30) expect(ids(historial)).toEqual(cerrados);
    else expect(ids(historial).every((id) => cerrados.includes(id))).toBe(true);
    // Ningún pedido sale en las dos listas.
    expect(ids(atender).filter((id) => ids(historial).includes(id))).toEqual([]);
  });

  it("una tarjeta por atender ofrece el paso siguiente; en el historial solo dice en qué quedó y deja corregir", async () => {
    const { TarjetaPedido } = await import("../src/app/(app)/cafeteria/pedidos/tarjeta-pedido");
    const pedido = (estado: string) => ({
      id: 9, nombre: "Ana", recibido_el: new Date().toISOString(), ubicacion: "Cancha 1", detalle_ubicacion: null, notas: null, pago: null, devuelta_de: null, total: 4000, estado,
      lineas: [{ producto_id: 1, nombre: "Empanadas", opcion: null, cantidad: 2, precio: 2000, subtotal: 4000 }],
    });
    const botones = (html: string) => [...html.matchAll(/<button[^>]*value="([a-z_]+)"/g)].map((m) => m[1]);

    const pendiente = renderToStaticMarkup(<TarjetaPedido pedido={pedido("pendiente")} porAtender volverA="/cafeteria/pedidos" />);
    expect(texto(pendiente)).toContain("Pendiente");
    expect(botones(pendiente)).toEqual(["en_preparacion", "entregado", "cancelado"]);

    const preparando = renderToStaticMarkup(<TarjetaPedido pedido={pedido("en_preparacion")} porAtender volverA="/cafeteria/pedidos" />);
    expect(botones(preparando)).toEqual(["entregado", "pendiente", "cancelado"]);

    const entregado = renderToStaticMarkup(<TarjetaPedido pedido={pedido("entregado")} porAtender={false} volverA="/cafeteria/pedidos?ver=historial" />);
    expect(texto(entregado)).toContain("Entregado");
    expect(texto(entregado)).toContain("Corregir estado");
    expect(botones(entregado)).toEqual(["pendiente", "en_preparacion", "cancelado"]);
    expect(entregado).toContain('name="volver" value="/cafeteria/pedidos?ver=historial"');

    // Uno de un día anterior que nadie cerró: está en el historial igual, y se dice por qué.
    const viejo = renderToStaticMarkup(<TarjetaPedido pedido={pedido("pendiente")} porAtender={false} volverA="/cafeteria/pedidos?ver=historial" />);
    expect(texto(viejo)).toContain("Es de un día anterior");

    // Forma de pago (23-nov-2026): los pedidos de antes no la tienen y no dicen nada;
    // con efectivo y billete, también cuánto cambio llevar.
    expect(texto(pendiente)).not.toContain("Pago:");
    const conQr = renderToStaticMarkup(<TarjetaPedido pedido={{ ...pedido("pendiente"), pago: "datafono" }} porAtender volverA="/cafeteria/pedidos" />);
    expect(texto(conQr)).toContain("Pago: Datáfono");
    const efectivo = renderToStaticMarkup(<TarjetaPedido pedido={{ ...pedido("pendiente"), pago: "efectivo", devuelta_de: 10000 }} porAtender volverA="/cafeteria/pedidos" />);
    expect(texto(efectivo)).toContain("Pago: Efectivo · devuelta de $10.000 · llevar $6.000 de cambio");
  });
});

describe("/carta · lo que ve el comprador", () => {
  it("muestra lo disponible y NO muestra lo no disponible ni lo que está sin precio", async () => {
    const { data } = await admin().from("cafeteria_productos").select("nombre, precio, disponible, categoria_id");
    const todos = data ?? [];
    const visibles = todos.filter((p) => p.disponible && p.precio > 0);
    const ocultos = todos.filter((p) => !p.disponible || p.precio <= 0);
    expect(visibles.length).toBeGreaterThan(0);

    const { default: Page } = await import("../src/app/carta/page");
    const html = renderToStaticMarkup(await Page());
    const t = texto(html);

    // Toda la carta va en UNA página (diseño del 20-nov-2026): cada producto visible
    // está, y NINGÚN oculto.
    for (const p of visibles) {
      expect(html, p.nombre).toContain(`>${escapar(p.nombre)}<`);
    }
    for (const p of ocultos) {
      expect(html, p.nombre).not.toContain(`>${escapar(p.nombre)}<`);
    }
    expect(html).toMatch(/aria-label="Agregar [^"]+"/);

    // Arriba la cuadrícula de categorías y abajo el botón que la vuelve a abrir.
    expect(t).toContain("¿Qué se te antoja?");
    expect(html).toContain('aria-label="Categorías"');
    expect(t).toContain("Categorías");
    // Lo que Laura pidió quitar: conteos de productos, letrero de zona y forma de pago.
    expect(t).not.toMatch(/\d+ productos?\b/);
    expect(t).not.toContain("Te lo llevamos a");
    expect(t).not.toContain("Cómo pagas");
  });

  it("la cuadrícula de categorías: foto del primer producto que tenga, sin conteos, y en la hoja marca dónde estás", async () => {
    const { Cuadricula } = await import("../src/app/carta/pedido");
    const p = (id: number, nombre: string, fotoUrl: string | null) => ({ id, nombre, descripcion: null, precio: 1000, opciones: [], fotoUrl });
    const categorias = [
      { id: 1, nombre: "Entradas", productos: [p(1, "Arepa", null), p(2, "Empanadas", "https://x.test/empanadas.webp")] },
      { id: 2, nombre: "Mekato", productos: [p(3, "Papas", null)] },
    ];
    const alEntrar = renderToStaticMarkup(<Cuadricula categorias={categorias} onElegir={() => {}} />);
    expect(alEntrar).toContain('src="https://x.test/empanadas.webp"');
    expect(veces(alEntrar, "<button")).toBe(2);
    expect(texto(alEntrar)).not.toContain("Estás aquí");
    expect(texto(alEntrar)).not.toMatch(/\d/);

    const enHoja = renderToStaticMarkup(<Cuadricula categorias={categorias} onElegir={() => {}} enHoja aqui={2} />);
    expect(veces(enHoja, "Estás aquí")).toBe(1);
    expect(enHoja).toMatch(/aria-current="true"[^>]*>(?:(?!<\/button>).)*Mekato/);
  });

  it("un producto con opciones llega PLEGADO: un botón «Elegir» y ninguna opción a la vista", async () => {
    const { FilaProducto } = await import("../src/app/carta/pedido");
    const milo = { id: 2, nombre: "Milo", descripcion: "En leche", precio: 8000, opciones: ["Frío", "Caliente"], fotoUrl: "https://x.test/m.jpg" };
    const html = renderToStaticMarkup(<FilaProducto producto={milo} conFotos cantidad={() => 0} onCambio={() => {}} onAmpliar={() => {}} />);
    expect(html).toContain('aria-expanded="false"');
    expect(texto(html)).toContain("Elegir");
    expect(texto(html)).toContain("$8.000");
    expect(html).not.toContain('aria-label="Agregar Milo');
    expect(texto(html)).not.toContain("Caliente");

    // Plegado y con algo ya escogido, el botón dice cuántos lleva en vez de «Elegir».
    const conDos = renderToStaticMarkup(
      <FilaProducto producto={milo} conFotos cantidad={(_, opcion) => (opcion === "Frío" ? 2 : 0)} onCambio={() => {}} onAmpliar={() => {}} />,
    );
    expect(texto(conDos)).toContain("2 en tu pedido");
    expect(texto(conDos)).not.toContain("Elegir");
  });

  it("al desplegarlo pide escoger: un botón de agregar por opción", async () => {
    const { FilaProducto } = await import("../src/app/carta/pedido");
    const html = renderToStaticMarkup(
      <FilaProducto
        producto={{ id: 2, nombre: "Milo", descripcion: "En leche", precio: 8000, opciones: ["Frío", "Caliente"], fotoUrl: "https://x.test/m.jpg" }}
        conFotos
        desplegado
        cantidad={() => 0}
        onCambio={() => {}}
        onAmpliar={() => {}}
      />,
    );
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-label="Agregar Milo frío"');
    expect(html).toContain('aria-label="Agregar Milo caliente"');
    expect(html).toContain('aria-label="Ver la foto de Milo"');
    expect(texto(html)).toContain("En leche");
    expect(texto(html)).toContain("$8.000");
    // Frío y Caliente no son frutas: no llevan dibujo.
    expect(html).not.toContain("data-fruta");
  });

  it("los sabores de un jugo llevan el dibujo de su fruta; un sabor sin dibujo queda sin él", async () => {
    const { FilaProducto } = await import("../src/app/carta/pedido");
    const html = renderToStaticMarkup(
      <FilaProducto
        producto={{ id: 3, nombre: "Jugos naturales", descripcion: null, precio: 8000, opciones: ["Mango", "Mora", "Fresa", "Guanábana", "Maracuyá", "Lulo"], fotoUrl: null }}
        conFotos={false}
        desplegado
        cantidad={() => 0}
        onCambio={() => {}}
        onAmpliar={() => {}}
      />,
    );
    for (const fruta of ["mango", "mora", "fresa", "guanabana", "maracuya"]) {
      expect(veces(html, `data-fruta="${fruta}"`), fruta).toBe(1);
    }
    expect(veces(html, "data-fruta=")).toBe(5);
    expect(html).toContain('aria-label="Agregar Jugos naturales lulo"');
  });
});
