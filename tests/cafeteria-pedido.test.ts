import { describe, it, expect } from "vitest";
import { rolesForModule } from "../src/lib/auth/permissions";
import { filtrar, sugerir } from "../src/lib/cafeteria/buscar";
import { ESTADOS, POR_ATENDER, esEstado, nombreEstado, sigueAbierto } from "../src/lib/cafeteria/estado";
import { leerOpciones, type ProductoCarta } from "../src/lib/cafeteria/carta";
import {
  enlaceWhatsApp,
  indexar,
  lineasParaGuardar,
  lineasValidas,
  mensajeWhatsApp,
  pesos,
  total,
  type DatosPedido,
} from "../src/lib/cafeteria/pedido";
import { pedidoSchema, productoSchema, whatsappSchema } from "../src/lib/validations/cafeteria";

/**
 * La lógica del pedido de la cafetería, sin base: qué líneas valen, cuánto suman
 * y qué texto sale para WhatsApp. Es la misma que usa el servidor para volver a
 * calcular el total con la carta de la base, así que aquí se fija la regla de
 * fondo: **lo que no está en la carta que se le pasa, no entra al pedido**.
 */

const producto = (id: number, nombre: string, precio: number, opciones: string[] = []): ProductoCarta => ({
  id, nombre, precio, opciones, descripcion: null, fotoUrl: null,
});
// La carta "disponible": empanadas y Milo. La hamburguesa NO está (apagada o sin precio).
const productos = indexar([{ productos: [producto(1, "Empanadas", 2000), producto(2, "Milo", 8000, ["Frío", "Caliente"])] }]);
const datos: DatosPedido = { nombre: " Ana ", ubicacion: " Cancha de pádel 2 ", detalleUbicacion: "banca azul", notas: "" };

describe("cafetería · líneas del pedido", () => {
  it("un producto que no está en la carta (apagado o eliminado) se cae del pedido", () => {
    const lineas = lineasValidas([{ productoId: 1, cantidad: 2 }, { productoId: 99, cantidad: 1 }], productos);
    expect(lineas).toEqual([{ productoId: 1, cantidad: 2 }]);
  });

  it("un producto con opciones exige una opción válida; uno sin opciones no admite ninguna", () => {
    expect(lineasValidas([{ productoId: 2, cantidad: 1 }], productos)).toEqual([]);
    expect(lineasValidas([{ productoId: 2, opcion: "Tibio", cantidad: 1 }], productos)).toEqual([]);
    expect(lineasValidas([{ productoId: 2, opcion: "Frío", cantidad: 1 }], productos)).toHaveLength(1);
    expect(lineasValidas([{ productoId: 1, opcion: "Frío", cantidad: 1 }], productos)).toEqual([]);
  });

  it("la cantidad tiene que ser un entero entre 1 y 20", () => {
    for (const cantidad of [0, -1, 1.5, 21]) {
      expect(lineasValidas([{ productoId: 1, cantidad }], productos), String(cantidad)).toEqual([]);
    }
  });

  it("el total sale de los precios de la carta, y el historial guarda nombre y precio como estaban", () => {
    const lineas = [{ productoId: 1, cantidad: 3 }, { productoId: 2, opcion: "Frío", cantidad: 1 }];
    expect(total(lineas, productos)).toBe(14000);
    expect(lineasParaGuardar(lineas, productos)).toEqual([
      { producto_id: 1, nombre: "Empanadas", opcion: null, cantidad: 3, precio: 2000, subtotal: 6000 },
      { producto_id: 2, nombre: "Milo", opcion: "Frío", cantidad: 1, precio: 8000, subtotal: 8000 },
    ]);
  });
});

describe("cafetería · mensaje de WhatsApp", () => {
  it("se titula con el nombre de la persona y lleva la ubicación que escribió con su detalle, cada línea y el total; SIN forma de pago", () => {
    const texto = mensajeWhatsApp([{ productoId: 1, cantidad: 2 }, { productoId: 2, opcion: "Caliente", cantidad: 1 }], datos, productos);
    expect(texto.split("\n")).toEqual([
      // El pedido se llama por el nombre de la persona, no por un código (Laura, 20-nov-2026).
      "*Pedido de Ana* · Cafetería CDAF",
      "*Ubicación:* Cancha de pádel 2 (banca azul)",
      "",
      "2 x Empanadas — $4.000",
      "1 x Milo (Caliente) — $8.000",
      "",
      "*Total: $12.000*",
    ]);
    expect(texto).not.toContain("Pago");
    expect(texto).not.toContain("#");
  });

  it("las notas van al final, y sin ubicación escrita lo dice en vez de dejar el renglón vacío", () => {
    const texto = mensajeWhatsApp([{ productoId: 1, cantidad: 1 }], { ...datos, ubicacion: "  ", detalleUbicacion: "", notas: " sin hielo " }, productos);
    expect(texto).toContain("*Ubicación:* Sin ubicación");
    expect(texto.split("\n").at(-1)).toBe("*Notas:* sin hielo");
  });

  it("el enlace limpia el número y, sin número, deja que WhatsApp escoja el contacto", () => {
    expect(enlaceWhatsApp("+57 300 123 4567", "hola")).toBe("https://wa.me/573001234567?text=hola");
    expect(enlaceWhatsApp("", "a b")).toBe("https://wa.me/?text=a%20b");
  });

  it("los pesos van con punto de miles y sin espacio", () => {
    expect(pesos(3500)).toBe("$3.500");
    expect(pesos(1161600)).toBe("$1.161.600");
  });
});

describe("cafetería · buscador de la carta", () => {
  const carta = [
    { id: 1, nombre: "Café y bebidas calientes", productos: [producto(10, "Capuchino", 7000), producto(11, "Chocolate", 6000)] },
    { id: 2, nombre: "Bebidas frías", productos: [producto(20, "Coca-Cola", 5000), producto(21, "Coca-Cola Zero", 5000), producto(22, "Agua con gas", 4000)] },
    { id: 3, nombre: "Mekato", productos: [producto(30, "Chocorramo", 3500), producto(31, "Maní con pasas", 3000)] },
    { id: 4, nombre: "Vacía", productos: [] },
  ];
  const nombres = (texto: string) => sugerir(carta, texto).map((s) => (s.tipo === "categoria" ? `[${s.categoria.nombre}]` : s.producto.nombre));

  it("sin nada escrito no sugiere nada y la carta queda completa", () => {
    expect(sugerir(carta, "  ")).toEqual([]);
    expect(filtrar(carta, "")).toBe(carta);
  });

  it("sugiere mientras se escribe, sin que importen tildes ni mayúsculas; primero lo que empieza igual", () => {
    expect(nombres("cho")).toEqual(["Chocolate", "Chocorramo"]);
    expect(nombres("MANI")).toEqual(["Maní con pasas"]);
    // "co": empiezan igual Coca-Cola y Coca-Cola Zero; después los que tienen una palabra que
    // empieza así ("con"); al final los que solo lo llevan por dentro (Cho-co-late).
    expect(nombres("co")).toEqual(["Coca-Cola", "Coca-Cola Zero", "Agua con gas", "Maní con pasas", "Chocolate", "Chocorramo"]);
  });

  it("el nombre de una categoría sale primero y, al filtrar, trae la categoría entera", () => {
    expect(nombres("cafe")).toEqual(["[Café y bebidas calientes]"]);
    expect(filtrar(carta, "cafe").map((c) => [c.nombre, c.productos.length])).toEqual([["Café y bebidas calientes", 2]]);
    // Una categoría sin productos no se sugiere.
    expect(nombres("vac")).toEqual([]);
  });

  it("varias palabras tienen que estar todas: 'coca zero' encuentra Coca-Cola Zero", () => {
    expect(nombres("coca zero")).toEqual(["Coca-Cola Zero"]);
    expect(filtrar(carta, "coca zero").flatMap((c) => c.productos.map((p) => p.nombre))).toEqual(["Coca-Cola Zero"]);
    expect(filtrar(carta, "pizza")).toEqual([]);
  });

  it("nunca ofrece más de seis sugerencias", () => {
    const larga = [{ id: 9, nombre: "Todo", productos: Array.from({ length: 30 }, (_, i) => producto(100 + i, `Arepa ${i}`, 1000)) }];
    expect(sugerir(larga, "are")).toHaveLength(6);
  });
});

describe("cafetería · validaciones", () => {
  it("las opciones se escriben separadas por coma; se limpian y no se repiten", () => {
    expect(leerOpciones(" Frío ,caliente,  frío, ")).toEqual(["Frío", "caliente"]);
    expect(leerOpciones("")).toEqual([]);
  });

  it("el precio acepta puntos de miles y el vacío queda en 0 (sin precio)", () => {
    const base = { nombre: "Limonada", categoriaId: "3" };
    expect(productoSchema.parse({ ...base, precio: "8.000" }).precio).toBe(8000);
    expect(productoSchema.parse({ ...base, precio: "" }).precio).toBe(0);
    expect(productoSchema.safeParse({ ...base, precio: "-5" }).success).toBe(false);
    expect(productoSchema.safeParse({ ...base, precio: "ocho mil" }).success).toBe(false);
  });

  it("el WhatsApp queda en solo dígitos; vacío vale, un número corto no", () => {
    expect(whatsappSchema.parse({ whatsapp: "+57 300 123-4567" }).whatsapp).toBe("573001234567");
    expect(whatsappSchema.parse({ whatsapp: "" }).whatsapp).toBe("");
    expect(whatsappSchema.safeParse({ whatsapp: "300123" }).success).toBe(false);
  });

  it("el pedido que manda el celular exige nombre y dónde está (texto libre, con tope); lo demás es opcional", () => {
    const bueno = { codigo: "K7P3", lineas: [{ productoId: 1, cantidad: 1 }], datos: { ...datos, nombre: "Ana" } };
    const leido = pedidoSchema.safeParse(bueno);
    expect(leido.success).toBe(true);
    // La ubicación se guarda sin los espacios de los lados.
    expect(leido.data?.datos.ubicacion).toBe("Cancha de pádel 2");
    expect(pedidoSchema.safeParse({ ...bueno, datos: { ...bueno.datos, ubicacion: "   " } }).success).toBe(false);
    expect(pedidoSchema.safeParse({ ...bueno, datos: { ...bueno.datos, ubicacion: "x".repeat(81) } }).success).toBe(false);
    expect(pedidoSchema.safeParse({ ...bueno, datos: { ...bueno.datos, nombre: "" } }).success).toBe(false);
    expect(pedidoSchema.safeParse({ ...bueno, datos: { ...bueno.datos, detalleUbicacion: "", notas: "" } }).success).toBe(true);
    expect(pedidoSchema.safeParse({ ...bueno, lineas: [] }).success).toBe(false);
    expect(pedidoSchema.safeParse({ ...bueno, codigo: "k7" }).success).toBe(false);
  });
});

describe("cafetería · estado del pedido", () => {
  it("son cuatro, nace pendiente, y solo pendiente y en preparación siguen por atender", () => {
    expect(ESTADOS.map((e) => e.id)).toEqual(["pendiente", "en_preparacion", "entregado", "cancelado"]);
    expect(POR_ATENDER).toEqual(["pendiente", "en_preparacion"]);
    expect(["pendiente", "en_preparacion", "entregado", "cancelado"].map(sigueAbierto)).toEqual([true, true, false, false]);
    expect(esEstado("entregado")).toBe(true);
    expect(esEstado("fiado")).toBe(false);
    expect(nombreEstado("en_preparacion")).toBe("En preparación");
  });
});

describe("cafetería · permisos", () => {
  it("la administran superadministrador, coordinación administrativa y recepción (decisión de Laura, 20-nov-2026)", () => {
    expect(rolesForModule("cafeteria", "edit")).toEqual(["superadmin", "coord_admin", "recepcion"]);
    expect(rolesForModule("cafeteria", "read")).toEqual(["superadmin", "coord_admin", "recepcion"]);
  });
});
