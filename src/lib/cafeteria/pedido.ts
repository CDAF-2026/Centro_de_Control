import type { ProductoCarta } from "./carta";

/**
 * Lógica del pedido que comparten la página (arma el mensaje y el enlace de
 * WhatsApp) y el servidor (vuelve a calcular el total con la carta de la base,
 * no con lo que mande el celular). Funciones puras: la carta se les pasa.
 */

/** Una línea del carrito: un producto, con su opción si la tiene (Milo frío…). */
export type Linea = { productoId: number; opcion?: string; cantidad: number };

const formatoPesos = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });

/**
 * Cómo va a pagar al recibir (Laura, 23-nov-2026). Se escoge una sola: con eso la
 * cafetería sabe si lleva el QR, el datáfono o el cambio. El 20-nov se había quitado
 * la forma de pago; volvió el 23-nov con estas tres opciones.
 */
export const FORMAS_PAGO = [
  { valor: "qr", nombre: "QR" },
  { valor: "datafono", nombre: "Datáfono" },
  { valor: "efectivo", nombre: "Efectivo" },
] as const;

export type FormaPago = (typeof FORMAS_PAGO)[number]["valor"];

export function nombrePago(valor: string | null | undefined): string | null {
  return FORMAS_PAGO.find((f) => f.valor === valor)?.nombre ?? null;
}

/** "50.000", "$50.000", "50 mil" a medias → 50000. Solo se quedan los dígitos; vacío → null. */
export function leerPesos(texto: string): number | null {
  const digitos = texto.replace(/\D/g, "");
  return digitos ? Number(digitos) : null;
}

/** Mientras se escribe: "50000" → "50.000". */
export function escribirPesos(texto: string): string {
  const valor = leerPesos(texto);
  return valor === null ? "" : formatoPesos.format(valor);
}

/**
 * Lo que la persona llena al pedir. Sin lista de zonas: dónde está lo ESCRIBE
 * (Laura, 20-nov-2026). La forma de pago volvió el 23-nov-2026.
 */
export type DatosPedido = {
  nombre: string;
  /** Dónde está, con sus palabras: "cancha de tenis 1", "zona social"… */
  ubicacion: string;
  /** Opcional, para que la encuentren: "banca azul", "camiseta roja"… */
  detalleUbicacion: string;
  notas: string;
  /** "" mientras no escoja. */
  pago: FormaPago | "";
  /** Solo con efectivo: con qué billete paga, tal como lo escribió ("50.000"). Opcional. */
  devuelta: string;
};

export const MAX_POR_LINEA = 20;

/** Los productos de la carta por id, para buscarlos sin recorrer las categorías. */
export type Productos = Map<number, ProductoCarta>;

export function indexar(categorias: { productos: ProductoCarta[] }[]): Productos {
  return new Map(categorias.flatMap((c) => c.productos).map((p) => [p.id, p]));
}

export function claveLinea(productoId: number, opcion?: string): string {
  return opcion ? `${productoId}:${opcion}` : String(productoId);
}

/** "$3.500". Sin el estilo `currency`: ese mete un espacio que WhatsApp y React leen distinto. */
export function pesos(valor: number): string {
  return `$${formatoPesos.format(valor)}`;
}

/** Nombre con la opción entre paréntesis: "Milo (Frío)". */
export function nombreLinea(linea: Linea, productos: Productos): string {
  const nombre = productos.get(linea.productoId)?.nombre ?? "Producto";
  return linea.opcion ? `${nombre} (${linea.opcion})` : nombre;
}

export function subtotal(linea: Linea, productos: Productos): number {
  return (productos.get(linea.productoId)?.precio ?? 0) * linea.cantidad;
}

export function total(lineas: Linea[], productos: Productos): number {
  return lineas.reduce((suma, l) => suma + subtotal(l, productos), 0);
}

export function unidades(lineas: Linea[]): number {
  return lineas.reduce((suma, l) => suma + l.cantidad, 0);
}

/**
 * Solo las líneas que siguen en la carta, con una opción válida y una cantidad
 * razonable. Como la carta ahora cambia (un producto se apaga o se borra), esto
 * es también lo que limpia un carrito guardado de antes.
 */
export function lineasValidas(lineas: Linea[], productos: Productos): Linea[] {
  return lineas.filter((l) => {
    const p = productos.get(l.productoId);
    if (!p || !Number.isInteger(l.cantidad) || l.cantidad < 1 || l.cantidad > MAX_POR_LINEA) return false;
    return p.opciones.length > 0 ? !!l.opcion && p.opciones.includes(l.opcion) : !l.opcion;
  });
}

/**
 * Código corto que identifica el pedido POR DENTRO (la fila del historial y los avisos
 * de error del servidor). No se le muestra a nadie: para la persona y para la cafetería
 * el pedido se llama por el NOMBRE de quien lo hizo (Laura, 20-nov-2026).
 * Sin 0/O ni 1/I, de cuando se leía en voz alta.
 */
export function codigoPedido(): string {
  const letras = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const azar = crypto.getRandomValues(new Uint32Array(4));
  return Array.from(azar, (n) => letras[n % letras.length]).join("");
}

/**
 * El texto que llega al WhatsApp de la cafetería. El pedido se llama por el nombre de la
 * persona ("Pedido de Ana"), no por un código. Sin emojis a propósito: algunos celulares
 * los convierten en "\uFFFD" al pasar por el enlace wa.me. El *texto* sale en negrita en WhatsApp.
 */
export function mensajeWhatsApp(lineas: Linea[], datos: DatosPedido, productos: Productos): string {
  const ubicacion = datos.ubicacion.trim() || "Sin ubicación";
  const detalle = datos.detalleUbicacion.trim();
  const notas = datos.notas.trim();
  const pago = nombrePago(datos.pago);
  const devuelta = datos.pago === "efectivo" ? leerPesos(datos.devuelta) : null;

  return [
    `*${tituloPedido(datos.nombre)}* · Cafetería CDAF`,
    `*Ubicación:* ${ubicacion}${detalle ? ` (${detalle})` : ""}`,
    "",
    ...lineas.map((l) => `${l.cantidad} x ${nombreLinea(l, productos)} — ${pesos(subtotal(l, productos))}`),
    "",
    `*Total: ${pesos(total(lineas, productos))}*`,
    ...(pago ? [`*Pago:* ${pago}${devuelta ? ` · devuelta de ${pesos(devuelta)}` : ""}`] : []),
    ...(notas ? [`*Notas:* ${notas}`] : []),
  ].join("\n");
}

/** Cómo se llama un pedido en todas partes: "Pedido de Ana". */
export function tituloPedido(nombre: string): string {
  return `Pedido de ${nombre.trim().replace(/\s+/g, " ")}`;
}

/**
 * Enlace que abre WhatsApp en el chat de la cafetería con el pedido ya escrito.
 * Sin número abre el selector de contactos (útil para probar).
 */
export function enlaceWhatsApp(numero: string, texto: string): string {
  const limpio = numero.replace(/\D/g, "");
  return `https://wa.me/${limpio}?text=${encodeURIComponent(texto)}`;
}

/** Una línea del pedido tal como queda guardada en el historial (foto, no puntero). */
export type LineaGuardada = {
  producto_id: number;
  nombre: string;
  opcion: string | null;
  cantidad: number;
  precio: number;
  subtotal: number;
};

export function lineasParaGuardar(lineas: Linea[], productos: Productos): LineaGuardada[] {
  return lineas.map((l) => {
    const p = productos.get(l.productoId);
    return {
      producto_id: l.productoId,
      nombre: p?.nombre ?? "Producto",
      opcion: l.opcion ?? null,
      cantidad: l.cantidad,
      precio: p?.precio ?? 0,
      subtotal: subtotal(l, productos),
    };
  });
}
