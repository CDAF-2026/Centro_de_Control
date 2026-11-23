import { createAdminClient } from "@/lib/supabase/admin";
import { leerCartaPublica } from "@/lib/cafeteria/publica";
import { indexar, leerPesos, lineasParaGuardar, lineasValidas, mensajeWhatsApp, total } from "@/lib/cafeteria/pedido";
import { pedidoSchema } from "@/lib/validations/cafeteria";

/**
 * Registro del pedido para el historial de `/cafeteria/pedidos`. La carta lo
 * llama justo antes de abrir WhatsApp y NO espera la respuesta: si esto falla,
 * el pedido igual sale por WhatsApp, que es lo que le llega a la cafetería.
 *
 * Es una ruta y no una Server Action porque la página se va a WhatsApp en el
 * mismo toque: el `fetch` con `keepalive` termina aunque la página se descargue.
 *
 * Es la segunda escritura pública del proyecto (la primera es `/registro`), así
 * que desconfía de todo lo que llega:
 *   · el total y los nombres se calculan con la carta de la BASE, no con lo que
 *     mande el celular; un producto apagado o borrado no entra;
 *   · tope de pedidos por ventana, para que alguien con un script no llene la tabla.
 */

/** Más de esto en 10 minutos no es un club pidiendo café: es un abuso. */
const TOPE_10_MIN = 150;

export async function POST(request: Request) {
  const cuerpo = await request.json().catch(() => null);
  const leido = pedidoSchema.safeParse(cuerpo);
  if (!leido.success) {
    return Response.json({ ok: false, error: "Pedido inválido" }, { status: 400 });
  }

  const carta = await leerCartaPublica();
  if (!carta) return Response.json({ ok: false, error: "No se pudo leer la carta" }, { status: 503 });

  const productos = indexar(carta.categorias);
  const { codigo, datos } = leido.data;
  const lineas = lineasValidas(leido.data.lineas, productos);
  if (lineas.length === 0) {
    return Response.json({ ok: false, error: "El pedido no tiene productos de la carta" }, { status: 400 });
  }

  const admin = createAdminClient();
  const hace10 = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("cafeteria_pedidos")
    .select("id", { count: "exact", head: true })
    .gte("recibido_el", hace10);
  if ((count ?? 0) >= TOPE_10_MIN) {
    console.error("[carta] tope de pedidos alcanzado; no se registra", codigo);
    return Response.json({ ok: false, error: "Demasiados pedidos" }, { status: 429 });
  }

  const valor = total(lineas, productos);
  const { error } = await admin.from("cafeteria_pedidos").insert({
    codigo,
    nombre: datos.nombre,
    ubicacion: datos.ubicacion,
    detalle_ubicacion: datos.detalleUbicacion || null,
    notas: datos.notas || null,
    pago: datos.pago,
    // Un billete menor que el total es un error de dedo: no se guarda, para no mandar un cambio equivocado.
    devuelta_de: datos.pago === "efectivo" && (leerPesos(datos.devuelta) ?? 0) >= valor ? leerPesos(datos.devuelta) : null,
    lineas: lineasParaGuardar(lineas, productos),
    total: valor,
    mensaje: mensajeWhatsApp(lineas, datos, productos),
  });
  if (error) {
    // Se registra el fallo: sin esto un historial con huecos se vería igual a un día flojo.
    console.error("[carta] no se pudo guardar el pedido", codigo, error.message);
    return Response.json({ ok: false, error: "No se pudo guardar" }, { status: 500 });
  }

  return Response.json({ ok: true, codigo, total: valor });
}
