import { z } from "zod";
import { ocupacionPorFranja } from "@/lib/easycancha/ocupacion";
import { FECHA, ErrorDeUso, herramienta, mapaNombresPerfiles, periodoTexto, revisar, validarRango } from "./comun";

/** La operación del club: clases, academias, paquetes, eventos, canchas y cafetería. */

export const clases = herramienta({
  nombre: "clases",
  etiqueta: "Contando las clases…",
  descripcion:
    "Clases registradas por profesor, deporte, tipo (academia, paquete, particular) y estado (programada = sin cerrar, realizada, cancelada, no_show), " +
    "con horas y valor. El valor sigue a la liquidación: particular = lo cobrado; paquete = precio del paquete ÷ sus clases; academia = 0, " +
    "porque la academia no tiene valor por clase (su dinero está en Siigo). Las clases de academia aparecen cuando el profesor las cierra.",
  esquema: z.object({ desde: FECHA, hasta: FECHA }),
  async ejecutar(ctx, a) {
    validarRango(a.desde, a.hasta);
    const filas = revisar(await ctx.supabase.rpc("agente_clases_resumen", { p_desde: a.desde, p_hasta: a.hasta }), "las clases");
    return { datos: filas, fuente: "Clases registradas en la plataforma", periodo: periodoTexto(a.desde, a.hasta) };
  },
});

const DIA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

export const academias = herramienta({
  nombre: "academias",
  etiqueta: "Revisando las academias…",
  descripcion:
    "Las academias: la programación semanal del planeador por profesor (clases, horas y cupos ocupados por semana), cuántas personas hay " +
    "matriculadas en cada academia, la asistencia de las clases cerradas en el periodo y cuántas clases del planeador siguen sin cerrar.",
  esquema: z.object({
    deporte: z.enum(["tenis", "padel", "ambos"]),
    desde: FECHA.describe("Inicio del periodo para asistencia y clases sin cerrar."),
    hasta: FECHA,
    incluir_horario: z.boolean().describe("true = incluye cada clase del planeador (día, hora, niños). Útil para hablar de horarios."),
  }),
  async ejecutar(ctx, a) {
    validarRango(a.desde, a.hasta);
    const deportes = a.deporte === "ambos" ? (["tenis", "padel"] as const) : ([a.deporte] as const);
    const hastaPend = a.hasta < ctx.hoy ? a.hasta : ctx.hoy;
    const [perfiles, lista, asistencia, pendientes, pausa, ...planeadores] = await Promise.all([
      mapaNombresPerfiles(ctx),
      ctx.supabase.from("academias").select("id, nombre, deporte, activa"),
      ctx.supabase.rpc("agente_asistencia_resumen", { p_desde: a.desde, p_hasta: a.hasta }),
      ctx.supabase.rpc("academia_pendientes", { p_desde: a.desde, p_hasta: hastaPend }, { count: "exact", head: true }),
      ctx.supabase.from("academia_pausa").select("desde").is("hasta", null).limit(1),
      ...deportes.map((d) => ctx.supabase.rpc("planeador_semana", { p_deporte: d })),
    ]);
    const academiasLista = (revisar(lista, "las academias") ?? []).filter((x) => deportes.includes(x.deporte as never));
    // Conteos en la base, una consulta por academia (son cuatro).
    const matriculas = await Promise.all(
      academiasLista.map(async (x) => {
        const r = await ctx.supabase.from("inscripciones").select("id", { count: "exact", head: true }).eq("academia_id", x.id).eq("activa", true);
        revisar(r, "las matrículas");
        return { academia: x.nombre, matriculados_activos: r.count };
      }),
    );

    const porProfesor = new Map<string, { profesor: string; clases_semana: number; horas_semana: number; cupos_ocupados: number; clases_colegio: number }>();
    const horario: unknown[] = [];
    planeadores.forEach((r, i) => {
      for (const c of revisar(r, "el planeador") ?? []) {
        const nombre = perfiles.get(c.profesor_id) ?? "Sin nombre";
        const fila = porProfesor.get(c.profesor_id) ?? { profesor: nombre, clases_semana: 0, horas_semana: 0, cupos_ocupados: 0, clases_colegio: 0 };
        fila.clases_semana += 1;
        fila.horas_semana += c.duracion_min / 60;
        fila.cupos_ocupados += c.ninos;
        if (c.colegio) fila.clases_colegio += 1;
        porProfesor.set(c.profesor_id, fila);
        if (a.incluir_horario) {
          horario.push({
            deporte: deportes[i],
            profesor: nombre,
            dia: DIA[c.dia_semana],
            hora: c.hora_inicio.slice(0, 5),
            minutos: c.duracion_min,
            ninos: c.ninos,
            recreativa: c.recreativa,
            competencia: c.competencia,
            colegio: c.colegio,
          });
        }
      }
    });
    revisar(pendientes, "las clases sin cerrar");
    return {
      datos: {
        en_pausa_desde: pausa.data?.[0]?.desde ?? null,
        matriculas,
        planeador_por_profesor: [...porProfesor.values()].map((f) => ({ ...f, horas_semana: Math.round(f.horas_semana * 10) / 10 })),
        nota_planeador: "Un niño que va dos días cuenta dos cupos: cupos_ocupados no es número de niños.",
        asistencia_clases_cerradas: revisar(asistencia, "la asistencia"),
        clases_del_planeador_sin_cerrar: pendientes.count,
        ...(a.incluir_horario ? { horario } : {}),
      },
      fuente: "Planeador de academias, matrículas y cierres de clase",
      periodo: periodoTexto(a.desde, a.hasta),
    };
  },
});

export const paquetes = herramienta({
  nombre: "paquetes",
  etiqueta: "Revisando los paquetes…",
  descripcion:
    "Paquetes de clases por deporte, paquete del catálogo y estado (activo, agotado, vencido, anulado): cuántos, clientes, clases vendidas y " +
    "consumidas, valor vendido y cuántos activos vencen en los próximos 15 días. Con fechas, solo los que iniciaron en ese rango.",
  esquema: z.object({
    desde: FECHA.nullable().describe("null = todos los paquetes."),
    hasta: FECHA.nullable(),
  }),
  async ejecutar(ctx, a) {
    if (a.desde && a.hasta) validarRango(a.desde, a.hasta);
    const filas = revisar(await ctx.supabase.rpc("agente_paquetes_resumen", { p_desde: a.desde, p_hasta: a.hasta }), "los paquetes");
    return {
      datos: filas,
      fuente: "Paquetes vendidos a clientes",
      periodo: a.desde && a.hasta ? `iniciados del ${periodoTexto(a.desde, a.hasta)}` : "todos",
    };
  },
});

export const eventos = herramienta({
  nombre: "eventos",
  etiqueta: "Revisando los eventos…",
  descripcion:
    "Torneos y eventos con su resultado: facturado (facturas de Siigo atadas al evento), cobrado, gastos, pago a profesores, costo y utilidad. " +
    "Un evento cerrado tiene su resultado congelado. El evento se mide por contribución: se ata la factura completa (con lo que esa persona consumió).",
  esquema: z.object({
    desde: FECHA.nullable().describe("Eventos que empiezan desde esta fecha; null = todos."),
    hasta: FECHA.nullable(),
  }),
  async ejecutar(ctx, a) {
    let q = ctx.supabase
      .from("eventos")
      .select("id, nombre, tipo, deporte, fecha_inicio, fecha_fin, estado, cerrado_el, cierre_ingreso, cierre_costo, cierre_utilidad")
      .order("fecha_inicio", { ascending: false });
    if (a.desde) q = q.gte("fecha_inicio", a.desde);
    if (a.hasta) q = q.lte("fecha_inicio", a.hasta);
    const [lista, pyg] = await Promise.all([q, ctx.supabase.rpc("eventos_pyg", { p_evento: null })]);
    const porId = new Map((revisar(pyg, "el resultado de los eventos") ?? []).map((p) => [p.evento_id, p]));
    return {
      datos: (revisar(lista, "los eventos") ?? []).map((e) => ({ ...e, resultado_en_vivo: porId.get(e.id) ?? null })),
      fuente: "Eventos y facturas de Siigo atadas a cada uno",
      periodo: a.desde || a.hasta ? periodoTexto(a.desde ?? "inicio", a.hasta ?? "hoy") : "todos",
    };
  },
});

export const ocupacion = herramienta({
  nombre: "ocupacion_canchas",
  etiqueta: "Midiendo la ocupación de las canchas en EasyCancha…",
  descripcion:
    "Ocupación de las canchas por día de la semana y hora (7 a. m. a 9 p. m.), por deporte, según las reservas de EasyCancha. " +
    "Mide minutos de cancha ocupados sobre los disponibles. Separa clases, alquiler y bloqueos internos del club (academia). " +
    "matriz = todo lo ocupado; matrizVenta = sin los bloqueos internos. Rango máximo: 92 días y que no pase de hoy " +
    "(lo futuro está reservado, no consumido). Tarda unos segundos.",
  esquema: z.object({ desde: FECHA, hasta: FECHA }),
  async ejecutar(ctx, a) {
    validarRango(a.desde, a.hasta, 92);
    if (a.hasta > ctx.hoy) throw new ErrorDeUso(`"hasta" no puede pasar de hoy (${ctx.hoy}).`);
    const r = await ocupacionPorFranja(a.desde, a.hasta);
    if (r.error) throw new Error(`EasyCancha: ${r.error}`);
    return {
      datos: { horario: "Cada número de la matriz es el % de la hora que EMPIEZA en esa columna.", tenis: r.tenis, padel: r.padel },
      fuente: "Reservas de EasyCancha",
      periodo: periodoTexto(a.desde, a.hasta),
    };
  },
});

export const cafeteriaPedidos = herramienta({
  nombre: "cafeteria_pedidos",
  etiqueta: "Revisando los pedidos de la cafetería…",
  descripcion:
    "Pedidos hechos por la carta QR de la cafetería, por estado, día, día de la semana, hora, forma de pago y producto. " +
    "Un pedido registrado no prueba que se entregó ni que se pagó, y no toda venta pasa por la carta: la venta real de la cafetería está en Siigo " +
    "(usa productos_vendidos o ingresos con la categoría Cafetería). La carta existe desde el 20-nov-2026.",
  esquema: z.object({ desde: FECHA, hasta: FECHA }),
  async ejecutar(ctx, a) {
    validarRango(a.desde, a.hasta);
    const filas = revisar(await ctx.supabase.rpc("agente_cafeteria_pedidos", { p_desde: a.desde, p_hasta: a.hasta }), "los pedidos");
    const agrupado: Record<string, unknown[]> = {};
    for (const f of filas ?? []) (agrupado[f.dimension] ??= []).push({ clave: f.clave, pedidos: f.pedidos, unidades: f.unidades, monto: f.monto });
    return { datos: agrupado, fuente: "Pedidos de la carta por QR", periodo: periodoTexto(a.desde, a.hasta) };
  },
});
