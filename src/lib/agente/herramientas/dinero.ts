import { z } from "zod";
import {
  FECHA,
  ErrorDeUso,
  avisoRezago,
  herramienta,
  listarServicios,
  periodoTexto,
  resolverServicio,
  revisar,
  validarRango,
} from "./comun";

/**
 * El dinero sale de Siigo (handoff §1.9) y con las mismas funciones del dashboard,
 * /ingresos y /cartera. Facturado = total − nota crédito; cobrado = lo que ya no
 * está en saldo; pendiente = saldo.
 */

export const ingresos = herramienta({
  nombre: "ingresos",
  etiqueta: "Consultando los ingresos en Siigo…",
  descripcion:
    "Facturado, cobrado y pendiente de cobro de un periodo, según las facturas de Siigo (la fuente del dinero del club). " +
    "Opcionalmente: facturado por categoría de servicio, cobrado por categoría, facturado por día y los clientes que más pagaron. " +
    "Para comparar dos periodos, llámala dos veces con rangos de la misma duración.",
  esquema: z.object({
    desde: FECHA,
    hasta: FECHA,
    incluir: z
      .array(z.enum(["por_servicio", "cobrado_por_servicio", "por_dia", "mejores_clientes"]))
      .describe("Desgloses a incluir además de los totales. Vacío = solo totales."),
    excluir_eventos: z
      .boolean()
      .describe(
        "true = como el dashboard: los torneos no suman su bruto (aportan su utilidad cuando se cierran). " +
          "false = como la pantalla de ingresos: el 100 % de lo facturado. Usa false salvo que pidan la cifra del dashboard.",
      ),
  }),
  async ejecutar(ctx, a) {
    validarRango(a.desde, a.hasta);
    const p = { p_desde: a.desde, p_hasta: a.hasta };
    const [servicios, recaudo, sync] = await Promise.all([
      listarServicios(ctx),
      ctx.supabase.rpc("siigo_recaudo", { ...p, p_excluir_eventos: a.excluir_eventos }),
      ctx.supabase.from("siigo_sync").select("updated_at").limit(1),
    ]);
    const nombre = new Map(servicios.map((s) => [s.id, s.nombre]));
    const r = revisar(recaudo, "el recaudo")?.[0] ?? { facturado: 0, cobrado: 0, pendiente: 0 };
    const datos: Record<string, unknown> = {
      facturado: r.facturado,
      cobrado: r.cobrado,
      pendiente_de_cobro: r.pendiente,
      excluye_bruto_de_eventos: a.excluir_eventos,
      ultima_sincronizacion_siigo: sync.data?.[0]?.updated_at ?? null,
    };
    const aviso = avisoRezago(a.hasta, ctx.hoy);
    if (aviso) datos.aviso = aviso;

    if (a.incluir.includes("por_servicio")) {
      const filas = revisar(
        await ctx.supabase.rpc("siigo_facturado_servicio", { ...p, p_excluir_eventos: a.excluir_eventos }),
        "lo facturado por servicio",
      );
      datos.facturado_por_servicio = (filas ?? [])
        .map((f) => ({ servicio: f.servicio_id == null ? "Sin categoría" : (nombre.get(f.servicio_id) ?? `#${f.servicio_id}`), facturado: f.monto }))
        .sort((x, y) => y.facturado - x.facturado);
    }
    if (a.incluir.includes("cobrado_por_servicio")) {
      const filas = revisar(await ctx.supabase.rpc("siigo_ingreso_servicio", p), "lo cobrado por servicio");
      datos.cobrado_por_servicio = (filas ?? [])
        .map((f) => ({ servicio: f.servicio_id == null ? "Sin categoría" : (nombre.get(f.servicio_id) ?? `#${f.servicio_id}`), cobrado: f.monto }))
        .sort((x, y) => y.cobrado - x.cobrado);
    }
    if (a.incluir.includes("por_dia")) {
      const filas = revisar(
        await ctx.supabase.rpc("siigo_facturado_diario", { ...p, p_excluir_eventos: a.excluir_eventos }),
        "lo facturado por día",
      );
      datos.facturado_por_dia = (filas ?? []).map((f) => ({ fecha: f.fecha, facturado: f.monto, facturas: f.facturas }));
    }
    if (a.incluir.includes("mejores_clientes")) {
      const filas = revisar(await ctx.supabase.rpc("siigo_top_clientes", { ...p, p_limite: 15 }), "los mejores clientes");
      datos.mejores_clientes = (filas ?? []).map((f) => ({ cliente_id: f.cliente_id, nombre: f.nombre, pagado: f.pagado }));
    }
    if (a.excluir_eventos) {
      const ret = revisar(await ctx.supabase.rpc("eventos_retenido", p), "los eventos abiertos");
      datos.eventos_abiertos_no_sumados = ret?.[0] ?? null;
    }
    return { datos, fuente: "Facturas de Siigo", periodo: periodoTexto(a.desde, a.hasta) };
  },
});

export const cartera = herramienta({
  nombre: "cartera",
  etiqueta: "Revisando la cartera…",
  descripcion:
    "Lo que le deben al club hoy (saldo de las facturas de Siigo), por antigüedad (0–30, 31–60, más de 60 días desde la fecha de la factura; " +
    "Siigo no trae vencimiento) y los clientes que más deben. Se puede limitar a una categoría de servicio.",
  esquema: z.object({
    servicio: z.string().nullable().describe("Categoría de servicio (p. ej. \"Academia Recreativa Tenis\") o null para todas."),
    top: z.number().int().min(1).max(50).describe("Cuántos deudores listar."),
  }),
  async ejecutar(ctx, a) {
    const servicio = a.servicio ? resolverServicio(await listarServicios(ctx), a.servicio) : null;
    const tramos = revisar(
      await ctx.supabase.rpc("siigo_cartera_antiguedad", { p_servicio: servicio?.id ?? null }),
      "la antigüedad de la cartera",
    );
    const datos: Record<string, unknown> = {
      categoria: servicio?.nombre ?? "todas",
      por_antiguedad: (tramos ?? []).map((t) => ({ tramo: t.tramo, facturas: t.n, saldo: t.total })),
      total: (tramos ?? []).reduce((s, t) => s + Number(t.total), 0),
    };
    if (!servicio) {
      // Ordenar y cortar en la base: traer todo y ordenar aquí se desinflaría en
      // silencio al pasar de 1.000 deudores (handoff §1.8).
      const r = await ctx.supabase
        .rpc("siigo_cartera", undefined, { count: "exact" })
        .order("saldo", { ascending: false })
        .limit(a.top);
      const top = revisar(r, "los deudores") ?? [];
      const fichas = top.length
        ? revisar(
            await ctx.supabase.from("clientes").select("id, nombres, apellidos").in("id", top.map((d) => d.cliente_id)),
            "los nombres de los deudores",
          )
        : [];
      const nombre = new Map((fichas ?? []).map((c) => [c.id, `${c.nombres} ${c.apellidos ?? ""}`.trim()]));
      datos.deudores_identificados = r.count;
      datos.mayores_deudores = top.map((d) => ({ cliente_id: d.cliente_id, nombre: nombre.get(d.cliente_id) ?? null, saldo: d.saldo }));
      datos.nota = "Los deudores son fichas identificadas; la deuda de ventas de mostrador (sin cliente) está en el total pero no en la lista.";
    }
    return { datos, fuente: "Saldo de las facturas de Siigo", periodo: `al ${ctx.hoy}` };
  },
});

export const ticket = herramienta({
  nombre: "ticket",
  etiqueta: "Calculando el ticket de venta…",
  descripcion:
    "Ticket de venta por mes y segmento: facturas, compradores, facturado, ticket promedio y mediana, facturas y gasto por comprador. " +
    "Segmentos: cliente_identificado (ficha o NIT) y mostrador (consumidor final, sin cliente: ahí hay ticket por factura pero no por cliente). " +
    "Las filas con mes \"todo el periodo\" y segmento \"todas\" son los totales. Con servicio, solo las facturas que incluyen esa categoría.",
  esquema: z.object({
    desde: FECHA,
    hasta: FECHA,
    servicio: z.string().nullable().describe("Categoría de servicio o null para todas las facturas."),
  }),
  async ejecutar(ctx, a) {
    validarRango(a.desde, a.hasta);
    const servicio = a.servicio ? resolverServicio(await listarServicios(ctx), a.servicio) : null;
    const filas = revisar(
      await ctx.supabase.rpc("agente_ticket", { p_desde: a.desde, p_hasta: a.hasta, p_servicio: servicio?.id ?? null }),
      "el ticket",
    );
    return {
      datos: { categoria: servicio?.nombre ?? "todas", filas, aviso: avisoRezago(a.hasta, ctx.hoy) },
      fuente: "Facturas de Siigo",
      periodo: periodoTexto(a.desde, a.hasta),
    };
  },
});

export const comprasJuntas = herramienta({
  nombre: "compras_juntas",
  etiqueta: "Buscando qué se compra junto…",
  descripcion:
    "Parejas de categorías (o de productos) que salen en la MISMA factura de Siigo, con cuántas veces sale cada una por su cuenta. " +
    "Sirve para ventas cruzadas y combos.",
  esquema: z.object({
    desde: FECHA,
    hasta: FECHA,
    nivel: z.enum(["servicio", "producto"]),
    limite: z.number().int().min(1).max(100),
  }),
  async ejecutar(ctx, a) {
    validarRango(a.desde, a.hasta);
    const filas = revisar(
      await ctx.supabase.rpc("agente_compras_juntas", { p_desde: a.desde, p_hasta: a.hasta, p_nivel: a.nivel, p_limite: a.limite }),
      "las compras conjuntas",
    );
    return { datos: filas, fuente: "Líneas de las facturas de Siigo", periodo: periodoTexto(a.desde, a.hasta) };
  },
});

export const productosVendidos = herramienta({
  nombre: "productos_vendidos",
  etiqueta: "Revisando las ventas por producto…",
  descripcion:
    "Ventas por producto según Siigo: unidades, facturado, número de facturas, última venta del periodo, última venta en toda la historia y días sin venderse. " +
    "Con una categoría (p. ej. \"Cafetería\") incluye también los productos de esa categoría que NO se vendieron en el periodo, que son los de menos rotación. " +
    "No hay costos ni inventario: mide rotación, no margen.",
  esquema: z.object({
    desde: FECHA,
    hasta: FECHA,
    servicio: z.string().nullable().describe("Categoría de servicio o null para todas."),
    orden: z.enum(["mas_vendidos", "menos_vendidos"]),
    limite: z.number().int().min(1).max(150),
  }),
  async ejecutar(ctx, a) {
    validarRango(a.desde, a.hasta);
    const servicio = a.servicio ? resolverServicio(await listarServicios(ctx), a.servicio) : null;
    if (a.orden === "menos_vendidos" && !servicio) {
      throw new ErrorDeUso("Para ver lo que menos rota, indica una categoría (p. ej. \"Cafetería\"): sin ella no se listan los productos sin ventas.");
    }
    const args = { p_desde: a.desde, p_hasta: a.hasta, p_servicio: servicio?.id ?? null };
    // Orden, corte y conteos en la base (handoff §1.8).
    const mas = a.orden === "mas_vendidos";
    const [lista, sinVenta] = await Promise.all([
      ctx.supabase
        .rpc("agente_productos_vendidos", args, { count: "exact" })
        .order(mas ? "facturado" : "unidades", { ascending: !mas })
        .order(mas ? "unidades" : "facturado", { ascending: !mas })
        .limit(a.limite),
      ctx.supabase.rpc("agente_productos_vendidos", args, { count: "exact", head: true }).eq("unidades", 0),
    ]);
    revisar(sinVenta, "los productos sin ventas");
    return {
      datos: {
        categoria: servicio?.nombre ?? "todas",
        productos_en_el_resultado: lista.count,
        sin_ventas_en_el_periodo: sinVenta.count,
        productos: revisar(lista, "las ventas por producto"),
      },
      fuente: "Líneas de las facturas de Siigo",
      periodo: periodoTexto(a.desde, a.hasta),
    };
  },
});
