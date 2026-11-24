import { z } from "zod";
import { FECHA, ErrorDeUso, herramienta, listarServicios, mapaNombresPerfiles, normalizar, periodoTexto, revisar, validarRango } from "./comun";

/**
 * Clientes. Ojo con el modelo de datos (handoff §6): una FICHA (`clientes`) es una
 * cuenta familiar; las PERSONAS están en `cliente_miembros`. Se busca en las dos.
 */

const nombreCompleto = (n: { nombres: string | null; apellidos: string | null }) => `${n.nombres ?? ""} ${n.apellidos ?? ""}`.trim();

export const clienteBuscar = herramienta({
  nombre: "cliente_buscar",
  etiqueta: "Buscando al cliente…",
  descripcion:
    "Busca fichas de clientes por nombre, apellido o documento (de la ficha o de cualquier persona de la familia). " +
    "Devuelve hasta 10 fichas con sus personas. Usa cliente_detalle con el id para ver todo de una ficha.",
  esquema: z.object({ texto: z.string().min(2).max(80) }),
  async ejecutar(ctx, a) {
    // Las comas y los paréntesis rompen el filtro "or" de PostgREST.
    const limpio = a.texto.replace(/[,()%*\\]/g, " ").trim();
    const palabras = normalizar(limpio).split(" ").filter((p) => p.length >= 2);
    if (!palabras.length) throw new ErrorDeUso("Escribe al menos un nombre o un documento.");
    // PostgREST no busca en "nombre + apellido" juntos: se busca la palabra más larga
    // y se filtra aquí por todas las palabras.
    const ancla = [...palabras].sort((x, y) => y.length - x.length)[0];
    const filtro = `nombres.ilike.%${ancla}%,apellidos.ilike.%${ancla}%,documento.ilike.%${ancla}%`;
    const [fichas, personas] = await Promise.all([
      ctx.supabase.from("clientes").select("id, nombres, apellidos, documento").or(filtro).limit(40),
      ctx.supabase.from("cliente_miembros").select("cliente_id, nombres, apellidos, documento").or(filtro).limit(40),
    ]);
    const casa = (n: { nombres: string | null; apellidos: string | null; documento: string | null }) => {
      const texto = normalizar(`${nombreCompleto(n)} ${n.documento ?? ""}`);
      return palabras.every((p) => texto.includes(p));
    };
    const ids = new Set<number>();
    for (const f of revisar(fichas, "las fichas") ?? []) if (casa(f)) ids.add(f.id);
    for (const m of revisar(personas, "las personas") ?? []) if (casa(m)) ids.add(m.cliente_id);
    const lista = [...ids].slice(0, 10);
    if (!lista.length) return { datos: { encontradas: 0 }, fuente: "Fichas de clientes" };

    const [detalle, miembros] = await Promise.all([
      ctx.supabase.from("clientes").select("id, nombres, apellidos, documento, estado, celular, email").in("id", lista),
      ctx.supabase.from("cliente_miembros").select("cliente_id, nombres, apellidos, es_titular, activo").in("cliente_id", lista),
    ]);
    const porFicha = new Map<number, string[]>();
    for (const m of revisar(miembros, "las personas") ?? []) {
      porFicha.set(m.cliente_id, [...(porFicha.get(m.cliente_id) ?? []), `${nombreCompleto(m)}${m.es_titular ? " (titular)" : ""}`]);
    }
    return {
      datos: {
        encontradas: ids.size,
        fichas: (revisar(detalle, "las fichas") ?? []).map((c) => ({
          cliente_id: c.id,
          ficha: nombreCompleto(c),
          documento: c.documento,
          estado: c.estado,
          celular: c.celular,
          email: c.email,
          personas: porFicha.get(c.id) ?? [],
        })),
      },
      fuente: "Fichas de clientes",
    };
  },
});

export const clienteDetalle = herramienta({
  nombre: "cliente_detalle",
  etiqueta: "Leyendo la ficha del cliente…",
  descripcion:
    "Todo lo de una ficha: datos, personas de la familia, acudientes, datos de facturación, paquetes, matrículas en academias, " +
    "facturado y pagado por categoría según Siigo, últimas facturas, últimas clases y notas del staff sobre ella.",
  esquema: z.object({ cliente_id: z.number().int().positive() }),
  async ejecutar(ctx, a) {
    const id = a.cliente_id;
    const [ficha, miembros, acudientes, extra, paquetes, inscripciones, resumen, facturas, deuda, clases, notas, servicios, perfiles] =
      await Promise.all([
        ctx.supabase
          .from("clientes")
          .select("id, nombres, apellidos, tipo_documento, documento, fecha_nacimiento, es_menor, celular, email, estado, deportes, factura_a_nombre, factura_a_nit, created_at")
          .eq("id", id)
          .maybeSingle(),
        ctx.supabase.from("cliente_miembros").select("id, nombres, apellidos, fecha_nacimiento, deportes, es_titular, activo").eq("cliente_id", id),
        ctx.supabase.from("acudientes").select("nombre, parentesco, rol, telefono, email").eq("cliente_id", id),
        ctx.supabase.from("cliente_facturacion_extra").select("nit, nombre").eq("cliente_id", id),
        ctx.supabase
          .from("paquetes_cliente")
          .select("id, catalogo_id, num_clases, clases_consumidas, precio, estado, inicia_el, vence_el")
          .eq("cliente_id", id)
          .order("inicia_el", { ascending: false })
          .limit(10),
        ctx.supabase
          .from("inscripciones")
          .select("miembro_id, academia_id, activa, fecha_inscripcion, retirada_el")
          .eq("cliente_id", id),
        ctx.supabase.rpc("siigo_resumen_cliente", { p_cliente: id }),
        ctx.supabase.rpc("siigo_facturas_cliente_servicio", { p_cliente: id }).order("fecha", { ascending: false }).limit(15),
        ctx.supabase.from("siigo_facturas").select("saldo").eq("cliente_id", id).gt("saldo", 0),
        ctx.supabase
          .from("clases")
          .select("fecha, hora_inicio, tipo, estado, deporte, profesor_id, paquete_cliente_id, valor_facturado, precio")
          .eq("cliente_id", id)
          .order("fecha", { ascending: false })
          .limit(15),
        ctx.supabase.rpc("notas_listar", { p_filtro: "todas", p_cliente: id, p_limite: 10 }),
        listarServicios(ctx),
        mapaNombresPerfiles(ctx),
      ]);
    // El proyecto no usa uniones de PostgREST (los tipos son manuales y sin
    // relaciones): los nombres de catálogo y academia se leen aparte.
    const [catalogo, academias] = await Promise.all([
      ctx.supabase.from("paquetes_catalogo").select("id, nombre"),
      ctx.supabase.from("academias").select("id, nombre"),
    ]);
    const nombreCatalogo = new Map((revisar(catalogo, "el catálogo de paquetes") ?? []).map((p) => [p.id, p.nombre]));
    const nombreAcademia = new Map((revisar(academias, "las academias") ?? []).map((x) => [x.id, x.nombre]));
    const c = revisar(ficha, "la ficha");
    if (!c) throw new ErrorDeUso(`No existe la ficha ${id}.`);
    const servicio = new Map(servicios.map((s) => [s.id, s.nombre]));
    const porServicio = (revisar(resumen, "el resumen de Siigo") ?? []).map((r) => ({
      servicio: servicio.get(r.servicio_id) ?? "Sin categoría",
      facturado: r.facturado,
      pagado: r.pagado,
    }));
    return {
      datos: {
        ficha: { ...c, nombre: nombreCompleto(c) },
        personas: revisar(miembros, "las personas"),
        acudientes: revisar(acudientes, "los acudientes"),
        facturacion_adicional: revisar(extra, "la facturación adicional"),
        paquetes: (revisar(paquetes, "los paquetes") ?? []).map((p) => ({
          ...p,
          paquete: p.catalogo_id ? (nombreCatalogo.get(p.catalogo_id) ?? null) : null,
        })),
        matriculas: (revisar(inscripciones, "las matrículas") ?? []).map((i) => ({
          ...i,
          academia: nombreAcademia.get(i.academia_id) ?? null,
        })),
        siigo_por_servicio: porServicio,
        deuda_actual: (revisar(deuda, "la deuda") ?? []).reduce((s, f) => s + f.saldo, 0),
        ultimas_facturas: (revisar(facturas, "las facturas") ?? []).map((f) => ({
          ...f,
          servicio: f.servicio_id == null ? "Sin categoría" : (servicio.get(f.servicio_id) ?? null),
        })),
        ultimas_clases: (revisar(clases, "las clases") ?? []).map((k) => ({
          ...k,
          profesor: k.profesor_id ? (perfiles.get(k.profesor_id) ?? null) : null,
          profesor_id: undefined,
        })),
        notas_del_staff: (notas.data ?? []).map((n) => ({
          fecha: n.created_at,
          estado: n.estado,
          autor: n.autor_nombre,
          texto_escrito_por_el_staff: n.texto,
        })),
      },
      fuente: "Ficha del cliente y facturas de Siigo",
    };
  },
});

export const clientesResumen = herramienta({
  nombre: "clientes_resumen",
  etiqueta: "Contando los clientes…",
  descripcion:
    "Indicadores de la base de clientes: fichas activas y retiradas, personas por deporte, menores y adultos, fichas nuevas en la plataforma, " +
    "fichas con compras en el periodo, primeras compras y fichas que compraron en el periodo anterior de igual duración y no en este (fuga). " +
    "Cada indicador trae su descripción.",
  esquema: z.object({ desde: FECHA, hasta: FECHA }),
  async ejecutar(ctx, a) {
    validarRango(a.desde, a.hasta);
    const filas = revisar(await ctx.supabase.rpc("agente_clientes_resumen", { p_desde: a.desde, p_hasta: a.hasta }), "los indicadores de clientes");
    return { datos: filas, fuente: "Fichas de clientes y facturas de Siigo", periodo: periodoTexto(a.desde, a.hasta) };
  },
});
