"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { instanteClase } from "@/lib/fecha";
import { profesoresActivos } from "@/lib/staff";
import { buscarClienteDeReserva } from "@/lib/clientes-match";
import { createClaseSchema } from "@/lib/validations/clase";
import type { AppRole } from "@/lib/database.types";

// Derivado de la matriz: el profesor VE el calendario (permiso de lectura) pero
// no puede crear ni materializar clases desde él.
const WRITE: AppRole[] = rolesForModule("clases", "edit");

export type ClaseFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

export async function createClaseIndividual(
  _prev: ClaseFormState,
  formData: FormData,
): Promise<ClaseFormState> {
  await requireRole(WRITE);
  const parsed = createClaseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] = i.message;
    return { error: "Revisa los campos.", fieldErrors };
  }
  const d = parsed.data;

  const supabase = await createClient();
  // Se busca a la PERSONA (miembro); la familia (cliente_id) sale del propio miembro.
  const miembroSel = Number(formData.get("miembroId")) || null;
  let miembroId: number | null = null;
  let clienteId = d.clienteId;
  if (miembroSel) {
    const { data: m } = await supabase.from("cliente_miembros").select("id, cliente_id").eq("id", miembroSel).maybeSingle();
    if (m) { miembroId = m.id; clienteId = m.cliente_id; }
  }
  if (!miembroId && clienteId) {
    const { data: tit } = await supabase.from("cliente_miembros").select("id").eq("cliente_id", clienteId).eq("es_titular", true).maybeSingle();
    miembroId = tit?.id ?? null;
  }

  const { data: c, error } = await supabase
    .from("clases")
    .insert({
      tipo: "individual",
      cliente_id: clienteId,
      miembro_id: miembroId,
      paquete_cliente_id: d.paqueteClienteId ? Number(d.paqueteClienteId) : null,
      profesor_id: d.profesorId || null,
      deporte: d.deporte,
      nivel: d.nivel || null,
      cancha: d.cancha || null,
      fecha: d.fecha,
      hora_inicio: d.horaInicio || null,
      hora_fin: d.horaFin || null,
      precio: d.precio,
      descuento_pct: d.descuento,
      estado: "programada",
    })
    .select("id")
    .single();
  if (error || !c) return { error: error?.message ?? "No se pudo crear la clase." };

  await logAudit({
    action: "clase.create",
    entity: "clases",
    entityId: String(c.id),
    after: { tipo: "individual", fecha: d.fecha },
  });
  revalidatePath("/clases");
  redirect("/clases");
}

// ─────────────────────────────────────────────────────────────
// Asignar una reserva de EasyCancha a un paquete (materializa la clase)
// ─────────────────────────────────────────────────────────────

export type PrepararAsignacion = {
  sinCorreo: boolean;
  sinCliente: boolean;
  clienteId?: number;
  clienteNombre?: string;
  paquetes: { id: number; label: string }[];
  profesores: { id: string; nombre: string }[];
};

/** Busca el cliente por correo + sus paquetes activos + la lista de profesores (para el modal). */
export async function prepararAsignacion(email: string, documento?: string): Promise<PrepararAsignacion> {
  await requireRole(WRITE);
  const supabase = await createClient();

  const profesores = (await profesoresActivos()).map((p) => ({ id: p.id, nombre: p.nombre ?? "—" }));

  const em = email.trim().toLowerCase();
  const doc = (documento ?? "").trim();
  // Sin correo NI cédula no hay por dónde buscar.
  if (!em && !doc) return { sinCorreo: true, sinCliente: true, paquetes: [], profesores };

  // Correo y, si no aparece, CÉDULA. Ver `clientes-match.ts`: el caso de Karent
  // Coronado, cuya ficha no se encontró por una letra de más en el correo, y
  // acabó con su clase de paquete cobrada como particular.
  const cliente = await buscarClienteDeReserva(supabase, { email: em, documento: doc });
  if (!cliente) return { sinCorreo: !em, sinCliente: true, paquetes: [], profesores };

  // Un paquete vencido no se ofrece. Se mira también la FECHA porque el job que
  // los marca corre de noche: si no, quedaría una ventana en la que se ofrece.
  const { data: pqs } = await supabase
    .from("paquetes_cliente")
    .select("id, num_clases, clases_consumidas, catalogo_id")
    .eq("cliente_id", cliente.id)
    .eq("estado", "activo")
    .or(`vence_el.is.null,vence_el.gte.${new Date().toISOString().slice(0, 10)}`);
  const catIds = [...new Set((pqs ?? []).map((p) => p.catalogo_id).filter((x): x is number => x != null))];
  const catName = new Map<number, string>();
  if (catIds.length) {
    const { data } = await supabase.from("paquetes_catalogo").select("id, nombre").in("id", catIds);
    for (const c of data ?? []) catName.set(c.id, c.nombre);
  }
  const paquetes = (pqs ?? [])
    .map((p) => ({ id: p.id, saldo: p.num_clases - p.clases_consumidas, nombre: p.catalogo_id ? catName.get(p.catalogo_id) ?? "Paquete" : "Paquete", num: p.num_clases }))
    .filter((p) => p.saldo > 0)
    .map((p) => ({ id: p.id, label: `${p.nombre} · ${p.saldo}/${p.num} disponibles` }));

  return { sinCorreo: false, sinCliente: false, clienteId: cliente.id, clienteNombre: `${cliente.nombres} ${cliente.apellidos}`, paquetes, profesores };
}

export async function materializarReserva(input: {
  modo: "paquete" | "particular";
  bookingId: string;
  email: string;
  nombres: string;
  apellidos: string;
  telefono: string;
  /** Cédula que manda EasyCancha; segundo camino para encontrar la ficha. */
  documento?: string;
  fecha: string;
  horaInicio: string;
  horaFin: string;
  deporte: "tenis" | "padel" | null;
  cancha: string;
  paqueteClienteId?: number | null;
  precio?: number;
  /**
   * Cuántas personas toman la clase. Lo pidió la dueña (15-sep-2026): el club
   * cobra por persona (1 → $130.000, 2 → $150.000) y cafetería, que es quien
   * registra la clase, no tenía dónde ponerlo — le tocaba a ella al cerrarla.
   * Además decide el escalón de pago del profesor en la liquidación.
   */
  numAsistentes?: number;
  profesorId: string;
}): Promise<CierreLikeState> {
  await requireRole(WRITE);
  const supabase = await createClient();

  // Idempotente. Se busca "alguna" clase, no exactamente una: un bloqueo de
  // academia puede haberse registrado partido en varias.
  const { data: existe } = await supabase
    .from("clases")
    .select("id")
    .eq("easycancha_booking_id", input.bookingId)
    .limit(1)
    .maybeSingle();
  if (existe) return { error: "Esta reserva ya estaba registrada como clase." };

  // Cliente por correo y, si no aparece, por CÉDULA (crear solo si no está por
  // ninguno de los dos). Obligatorio para paquete; opcional para particular.
  // ⚠️ Buscar solo por correo fue lo que partió en dos la ficha de Karent
  // Coronado: una letra de diferencia creó una ficha nueva sin sus paquetes.
  const em = input.email.trim().toLowerCase();
  const doc = (input.documento ?? "").trim();
  let clienteId: number | null = null;
  if (em || doc) {
    const c = await buscarClienteDeReserva(supabase, { email: em, documento: doc });
    clienteId = c?.id ?? null;
    if (!clienteId && em) {
      const { data: nc, error } = await supabase
        .from("clientes")
        // Se le guarda la CÉDULA: es lo que hará que la próxima reserva de esta
        // persona encuentre ESTA ficha aunque el correo venga distinto.
        .insert({
          nombres: input.nombres || "(sin nombre)",
          apellidos: input.apellidos || "",
          email: em,
          celular: input.telefono || null,
          es_menor: false,
          ...(doc ? { documento: doc.replace(/\D/g, "") } : {}),
        })
        .select("id")
        .single();
      if (error || !nc) return { error: `No se pudo crear el cliente: ${error?.message ?? ""}` };
      clienteId = nc.id;
    }
  }

  let paqueteClienteId: number | null = null;
  let precio = 0;
  if (input.modo === "paquete") {
    if (!clienteId) return { error: "La reserva no tiene correo; no se puede vincular a un paquete." };
    const { data: pq } = await supabase
      .from("paquetes_cliente")
      .select("id, cliente_id, num_clases, clases_consumidas, estado, vence_el")
      .eq("id", input.paqueteClienteId ?? 0)
      .maybeSingle();
    if (!pq || pq.cliente_id !== clienteId) return { error: "El paquete no corresponde a este cliente." };
    // El guardia del servidor también revisa la fecha: la lista podía haberse
    // pintado antes de que el paquete venciera.
    if (pq.estado === "vencido" || (pq.vence_el != null && pq.vence_el < new Date().toISOString().slice(0, 10))) {
      return { error: "Ese paquete está vencido: ya no se le pueden cobrar clases." };
    }
    if (pq.estado !== "activo" || pq.num_clases - pq.clases_consumidas <= 0) return { error: "El paquete no tiene saldo disponible." };
    paqueteClienteId = pq.id;
  } else {
    precio = Number.isFinite(input.precio) ? Number(input.precio) : 0;
  }

  // Entre 1 y 20. Sin dato se deja null y `/cierre` y la liquidación caen a 1,
  // que es el comportamiento que ya había.
  const n = Number(input.numAsistentes);
  const numAsistentes = Number.isFinite(n) && n >= 1 && n <= 20 ? Math.trunc(n) : null;

  const { data: clase, error: insErr } = await supabase
    .from("clases")
    .insert({
      tipo: "individual",
      cliente_id: clienteId,
      paquete_cliente_id: paqueteClienteId,
      profesor_id: input.profesorId || null,
      deporte: input.deporte,
      cancha: input.cancha || null,
      fecha: input.fecha,
      hora_inicio: input.horaInicio || null,
      hora_fin: input.horaFin || null,
      precio,
      num_asistentes: numAsistentes,
      estado: "programada",
      easycancha_booking_id: input.bookingId,
    })
    .select("id")
    .single();
  if (insErr || !clase) return { error: insErr?.message ?? "No se pudo crear la clase." };

  await logAudit({
    action: input.modo === "paquete" ? "clase.asignar_paquete" : "clase.particular",
    entity: "clases",
    entityId: String(clase.id),
    after: { easycancha_booking_id: input.bookingId, paquete_cliente_id: paqueteClienteId, modo: input.modo, precio, num_asistentes: numAsistentes },
  });
  revalidatePath("/clases");
  revalidatePath("/cierre");
  return {
    ok: input.modo === "paquete"
      ? "Clase asignada al paquete. Ya aparece en clases por cerrar."
      : "Clase particular creada. Ya aparece en clases por cerrar.",
  };
}

type CierreLikeState = { error?: string; ok?: string };

/**
 * Corrige el valor cobrado de una clase PARTICULAR (individual sin paquete).
 *
 * Escribe `valor_facturado`, que es un override: el cierre y la liquidación ya leen
 * `valor_facturado ?? precio`, así que no hay que tocarlos. Se conserva `precio` con
 * lo que se tecleó al registrarla, para que quede el rastro de qué se corrigió.
 *
 * Dos guardias, validados AQUÍ y no solo en la pantalla (el guardia de la página no
 * protege la server action):
 *  · Solo particulares: las de paquete derivan su valor del paquete y la academia no
 *    tiene valor por clase; dejar editarlas produciría cifras que nadie sabría explicar.
 *  · Pasadas 24 h del inicio de la clase, solo el SA. Se usa el MISMO plazo y el mismo
 *    helper que el techo de `/cierre` a propósito: así el equipo tiene una sola regla que
 *    recordar ("24 h desde que empezó") en vez de dos parecidas. Medido en agosto-2026,
 *    una clase particular se registra y se cierra en segundos, así que atar el permiso al
 *    estado `programada` habría dejado a recepción sin ventana real para corregir.
 */
export type ValorClaseState = { error?: string; ok?: string; valor?: number; personas?: number };

export async function editarValorClase(_prev: ValorClaseState, formData: FormData): Promise<ValorClaseState> {
  const profile = await requireRole(WRITE);
  const claseId = Number(formData.get("claseId"));
  const crudo = String(formData.get("valor") ?? "").replace(/[^\d]/g, "");
  if (!claseId) return { error: "Clase inválida." };
  if (!crudo) return { error: "Escribe el valor cobrado." };
  const valor = Number(crudo);
  if (!Number.isFinite(valor) || valor < 0) return { error: "El valor debe ser un número positivo." };
  if (valor > 100_000_000) return { error: "Ese valor es demasiado alto; revísalo." };

  // Las personas van JUNTO al valor y no en su propia acción porque en el club
  // son la misma corrección: "vinieron 2, entonces son $150.000". Partirlo en
  // dos botones invita a cambiar uno y olvidar el otro, que es justo el
  // descuadre que se quiere evitar.
  const personasCrudo = String(formData.get("personas") ?? "").replace(/[^\d]/g, "");
  const personas = personasCrudo ? Number(personasCrudo) : null;
  if (personas != null && (personas < 1 || personas > 20)) {
    return { error: "El número de personas debe estar entre 1 y 20." };
  }

  const supabase = await createClient();
  const { data: clase } = await supabase
    .from("clases")
    .select("id, tipo, estado, fecha, hora_inicio, paquete_cliente_id, precio, valor_facturado, num_asistentes")
    .eq("id", claseId)
    .maybeSingle();
  if (!clase) return { error: "No se encontró la clase." };
  if (clase.tipo !== "individual" || clase.paquete_cliente_id) {
    return { error: "Solo se puede corregir el valor de una clase particular." };
  }
  const venció = Date.now() > instanteClase(clase.fecha, clase.hora_inicio, "23:59:00") + 24 * 3600 * 1000;
  if (venció && profile.role !== "superadmin") {
    return { error: "Pasaron más de 24 h desde la clase y su valor ya cuenta para la liquidación. Pídele el ajuste al superadministrador." };
  }

  const { error } = await supabase
    .from("clases")
    .update({ valor_facturado: valor, ...(personas != null ? { num_asistentes: personas } : {}) })
    .eq("id", claseId);
  if (error) return { error: error.message };

  await logAudit({
    action: "clase.editar_valor",
    entity: "clases",
    entityId: String(claseId),
    before: { valor_facturado: clase.valor_facturado, precio: clase.precio, num_asistentes: clase.num_asistentes },
    after: { valor_facturado: valor, num_asistentes: personas ?? clase.num_asistentes, estado: clase.estado },
  });
  revalidatePath("/clases");
  revalidatePath("/cierre");
  revalidatePath("/liquidacion");
  // Se devuelve el valor guardado para que el modal confirme con la cifra real del
  // servidor: su copia del evento es de cuando se abrió y no se refresca sola.
  return { ok: "Cambio guardado.", valor, personas: personas ?? clase.num_asistentes ?? undefined };
}

// ─────────────────────────────────────────────────────────────
// Cambiar cómo se cobra una clase ya registrada (paquete ↔ particular)
// ─────────────────────────────────────────────────────────────

export type PrepararCobro = {
  error?: string;
  clienteId?: number;
  clienteNombre?: string;
  /** Paquetes activos, vigentes y con saldo del cliente de la clase. */
  paquetes: { id: number; label: string }[];
};

/**
 * Paquetes a los que se puede mover esta clase. Se pide al abrir el formulario
 * y no al pintar el calendario: el mes trae decenas de clases y casi ninguna se
 * va a corregir.
 */
export async function prepararCobro(claseId: number): Promise<PrepararCobro> {
  await requireRole(WRITE);
  const supabase = await createClient();

  const { data: clase } = await supabase
    .from("clases")
    .select("id, tipo, cliente_id, paquete_cliente_id")
    .eq("id", Number(claseId) || 0)
    .maybeSingle();
  if (!clase) return { error: "No se encontró la clase.", paquetes: [] };
  if (!clase.cliente_id) {
    return { error: "Esta clase no tiene cliente, así que no se le puede cobrar un paquete.", paquetes: [] };
  }

  const { data: cli } = await supabase
    .from("clientes")
    .select("id, nombres, apellidos")
    .eq("id", clase.cliente_id)
    .maybeSingle();

  // Mismo criterio que `prepararAsignacion`: activo Y vigente por fecha. El job
  // que marca vencidos corre de noche, así que mirar solo el estado deja una
  // ventana en la que se ofrecería un paquete ya muerto.
  const hoy = new Date().toISOString().slice(0, 10);
  const { data: pqs } = await supabase
    .from("paquetes_cliente")
    .select("id, num_clases, clases_consumidas, catalogo_id")
    .eq("cliente_id", clase.cliente_id)
    .eq("estado", "activo")
    .or(`vence_el.is.null,vence_el.gte.${hoy}`);

  const catIds = [...new Set((pqs ?? []).map((p) => p.catalogo_id).filter((x): x is number => x != null))];
  const catName = new Map<number, string>();
  if (catIds.length) {
    const { data } = await supabase.from("paquetes_catalogo").select("id, nombre").in("id", catIds);
    for (const c of data ?? []) catName.set(c.id, c.nombre);
  }

  const paquetes = (pqs ?? [])
    .map((p) => ({
      id: p.id,
      saldo: p.num_clases - p.clases_consumidas,
      nombre: p.catalogo_id ? catName.get(p.catalogo_id) ?? "Paquete" : "Paquete",
      num: p.num_clases,
    }))
    // El paquete al que YA está atada se ofrece igual: así el selector no sale
    // vacío cuando es el único, y se ve de dónde viene la clase.
    .filter((p) => p.saldo > 0 || p.id === clase.paquete_cliente_id)
    .map((p) => ({ id: p.id, label: `${p.nombre} · ${p.saldo}/${p.num} disponibles` }));

  return {
    clienteId: clase.cliente_id,
    clienteNombre: cli ? `${cli.nombres} ${cli.apellidos}` : undefined,
    paquetes,
  };
}

export type CobroClaseState = { error?: string; ok?: string };

/**
 * Pasa una clase individual de PARTICULAR a PAQUETE (o al revés, o a otro paquete).
 *
 * Hasta ahora esto no existía: registrar mal solo se arreglaba borrando la clase
 * y volviéndola a crear. Es el hueco que dejó la clase de Karent Coronado
 * cobrada como particular a $150.000 cuando iba contra su paquete.
 *
 * ⚠️ **El saldo del paquete se mueve SOLO si la clase ya está cerrada.** El
 * descuento lo hace `cerrarClase` (→ `paquete_consumir`), así que una clase
 * `programada` no ha consumido nada y tocarle el saldo aquí la cobraría DOS
 * veces al cerrarla. Justo eso pasó al arreglar a mano la clase 424 el
 * 15-sep-2026: se le bajó el saldo al paquete 23 con la clase aún programada.
 *
 * ⚠️ **El orden de los tres pasos no es intercambiable**: devolver el saldo del
 * paquete viejo → mover la clase → descontar del nuevo. `paquete_consumir` lee
 * el `paquete_cliente_id` que la clase tiene EN ESE MOMENTO, así que hacerlo
 * después del update devolvería el saldo al paquete equivocado. Mismo cuidado
 * que en `corregirTurno`.
 *
 * ⚠️ **Al pasar a paquete se borra `valor_facturado`.** La liquidación lee
 * `valor_facturado ?? valorDelPaquete` (liquidacion.ts), así que dejar el
 * override puesto seguiría pagándole al profesor sobre el precio de particular.
 *
 * Mismo techo de 24 h que `editarValorClase`, con el mismo helper y a propósito:
 * una sola regla que recordar. Pasado el plazo, solo el superadministrador.
 */
export async function cambiarCobroClase(input: {
  claseId: number;
  modo: "paquete" | "particular";
  paqueteClienteId?: number | null;
  precio?: number;
}): Promise<CobroClaseState> {
  const profile = await requireRole(WRITE);
  const claseId = Number(input.claseId);
  if (!claseId) return { error: "Clase inválida." };

  const supabase = await createClient();
  const { data: clase } = await supabase
    .from("clases")
    .select("id, tipo, estado, fecha, hora_inicio, cliente_id, paquete_cliente_id, precio, valor_facturado")
    .eq("id", claseId)
    .maybeSingle();
  if (!clase) return { error: "No se encontró la clase." };
  if (clase.tipo !== "individual") {
    return { error: "Solo se puede cambiar el cobro de una clase individual." };
  }
  if (clase.estado === "cancelada" || clase.estado === "no_show") {
    return { error: "Esta clase está cancelada: no tiene cobro que cambiar." };
  }

  const venció = Date.now() > instanteClase(clase.fecha, clase.hora_inicio, "23:59:00") + 24 * 3600 * 1000;
  if (venció && profile.role !== "superadmin") {
    return {
      error:
        "Pasaron más de 24 h desde la clase y su cobro ya cuenta para la liquidación. Pídele el cambio al superadministrador.",
    };
  }

  const viejo = clase.paquete_cliente_id;
  // Solo la clase CERRADA ha consumido saldo; la programada lo consume al cerrarse.
  const mueveSaldo = clase.estado === "realizada";

  let nuevo: number | null = null;
  let precio = 0;
  if (input.modo === "paquete") {
    if (!clase.cliente_id) {
      return { error: "Esta clase no tiene cliente, así que no se le puede cobrar un paquete." };
    }
    const pqId = Number(input.paqueteClienteId);
    if (!pqId) return { error: "Escoge el paquete." };
    if (pqId === viejo) return { error: "La clase ya se cobra de ese paquete." };

    const { data: pq } = await supabase
      .from("paquetes_cliente")
      .select("id, cliente_id, num_clases, clases_consumidas, estado, vence_el")
      .eq("id", pqId)
      .maybeSingle();
    if (!pq || pq.cliente_id !== clase.cliente_id) return { error: "Ese paquete no es de este cliente." };
    if (pq.estado === "vencido" || (pq.vence_el != null && pq.vence_el < new Date().toISOString().slice(0, 10))) {
      return { error: "Ese paquete está vencido: ya no se le pueden cobrar clases." };
    }
    if (pq.estado !== "activo") return { error: "Ese paquete no está activo." };
    // El saldo solo tiene que alcanzar si la clase ya está cerrada: es cuando se descuenta.
    if (mueveSaldo && pq.num_clases - pq.clases_consumidas <= 0) {
      return { error: "Ese paquete no tiene saldo disponible." };
    }
    nuevo = pq.id;
  } else {
    if (!viejo) return { error: "La clase ya es particular." };
    const v = Number(input.precio);
    if (!Number.isFinite(v) || v < 0) return { error: "Escribe el valor a cobrar." };
    if (v > 100_000_000) return { error: "Ese valor es demasiado alto; revísalo." };
    precio = Math.trunc(v);
  }

  // 1) Devolver el saldo al paquete viejo, MIENTRAS la clase todavía lo apunta.
  if (mueveSaldo && viejo) {
    const { error } = await supabase.rpc("paquete_consumir", { p_clase: claseId, p_delta: -1 });
    if (error) return { error: `No se pudo devolver la clase al paquete anterior: ${error.message}` };
  }

  // 2) Mover la clase. `valor_facturado` se limpia siempre: si va a paquete, el
  //    override taparía el valor del paquete; si va a particular, el precio
  //    nuevo es el que manda.
  const { error: updErr } = await supabase
    .from("clases")
    .update({ paquete_cliente_id: nuevo, precio, valor_facturado: null })
    .eq("id", claseId);
  if (updErr) {
    // Se deshace el paso 1 para no dejar el saldo inflado con la clase intacta.
    if (mueveSaldo && viejo) await supabase.rpc("paquete_consumir", { p_clase: claseId, p_delta: 1 });
    return { error: updErr.message };
  }

  // 3) Descontar del paquete nuevo, ya con la clase apuntándolo.
  if (mueveSaldo && nuevo) {
    const { error } = await supabase.rpc("paquete_consumir", { p_clase: claseId, p_delta: 1 });
    if (error) {
      // Se revierte todo: la clase vuelve a como estaba y el saldo viejo también.
      await supabase
        .from("clases")
        .update({ paquete_cliente_id: viejo, precio: clase.precio, valor_facturado: clase.valor_facturado })
        .eq("id", claseId);
      if (viejo) await supabase.rpc("paquete_consumir", { p_clase: claseId, p_delta: 1 });
      return { error: `No se pudo descontar del paquete nuevo: ${error.message}. La clase quedó como estaba.` };
    }
  }

  await logAudit({
    action: "clase.cambiar_cobro",
    entity: "clases",
    entityId: String(claseId),
    before: { paquete_cliente_id: viejo, precio: clase.precio, valor_facturado: clase.valor_facturado, estado: clase.estado },
    after: { paquete_cliente_id: nuevo, precio, valor_facturado: null, modo: input.modo, saldo_movido: mueveSaldo },
  });
  revalidatePath("/clases");
  revalidatePath("/cierre");
  revalidatePath("/liquidacion");

  // El aviso dice si el saldo se movió o si se moverá al cerrar: son dos
  // situaciones distintas y confundirlas es lo que produjo el doble descuento.
  const nota = nuevo
    ? mueveSaldo
      ? "Se descontó del paquete."
      : "Se descontará del paquete al cerrar la clase."
    : "Ahora se cobra aparte.";
  return { ok: `${nuevo ? "Clase de paquete" : "Clase particular"}. ${nota}` };
}

/**
 * Asigna el profesor a una clase que se quedó SIN profesor.
 *
 * El club crea reservas en EasyCancha sin profesor —porque el profe es nuevo y
 * todavía no está creado allá, o simplemente se les olvidó— y al materializarlas
 * la clase entra con `profesor_id = null`. El daño es invisible: la liquidación
 * las salta (`if (!c.profesor_id) continue` en liquidacion.ts), así que la clase
 * se dictó, se cobró, y no se le pagó a nadie sin un solo error por ningún lado.
 *
 * Tres guardias, validados AQUÍ y no solo en la pantalla (el guardia de la
 * página no protege la server action):
 *  · Solo si la clase NO tiene profesor. Esto REPARA una omisión, no reasigna:
 *    poner a alguien donde no había nadie solo puede SUMARLE una clase a su
 *    liquidación, nunca quitársela a otro. Cambiar un profesor ya puesto movería
 *    plata de una persona a otra y es una decisión distinta, que hoy no existe.
 *  · El profesor tiene que salir de `staff_docentes`: es quien tiene con qué
 *    cobrarla. Un id tecleado a mano no pasa.
 *  · NO lleva el techo de 24 h que sí tiene `editarValorClase`, y es a propósito:
 *    estas clases se descubren justamente tarde (la del 12-sep apareció el 15),
 *    así que un plazo de 24 h dejaría sin arreglo exactamente los casos que
 *    motivaron esto. El rastro queda en `audit_log`.
 */
export type ProfesorClaseState = { error?: string; ok?: string; profesor?: string };

export async function asignarProfesorClase(
  _prev: ProfesorClaseState,
  formData: FormData,
): Promise<ProfesorClaseState> {
  await requireRole(WRITE);
  const claseId = Number(formData.get("claseId"));
  const profesorId = String(formData.get("profesorId") ?? "").trim();
  if (!claseId) return { error: "Clase inválida." };
  if (!profesorId) return { error: "Escoge un profesor." };

  const supabase = await createClient();
  const { data: clase } = await supabase
    .from("clases")
    .select("id, profesor_id, deporte, fecha, hora_inicio, estado")
    .eq("id", claseId)
    .maybeSingle();
  if (!clase) return { error: "No se encontró la clase." };
  if (clase.profesor_id) {
    return { error: "Esta clase ya tiene profesor. Para cambiarlo, pídeselo al superadministrador." };
  }

  // Que sea alguien a quien de verdad se le pueda pagar por dictar.
  const docentes = await profesoresActivos();
  const elegido = docentes.find((p) => p.id === profesorId);
  if (!elegido) return { error: "Ese profesor no está disponible para dictar." };

  const { error } = await supabase
    .from("clases")
    .update({ profesor_id: profesorId })
    .eq("id", claseId)
    // Carrera: si entre la lectura y el update alguien más lo asignó, este
    // update no toca nada en vez de pisarle el profesor al otro.
    .is("profesor_id", null);
  if (error) return { error: error.message };

  await logAudit({
    action: "clase.asignar_profesor",
    entity: "clases",
    entityId: String(claseId),
    before: { profesor_id: null },
    after: { profesor_id: profesorId, estado: clase.estado, deporte: clase.deporte },
  });
  revalidatePath("/clases");
  revalidatePath("/cierre");
  revalidatePath("/liquidacion");
  // Se devuelve el nombre para que el modal confirme: su copia del evento es de
  // cuando se abrió y no se refresca sola.
  return { ok: "Profesor asignado.", profesor: elegido.nombre ?? "—" };
}

// ─────────────────────────────────────────────────────────────
// Registrar un bloqueo de academia de EasyCancha como clase(s)
// ─────────────────────────────────────────────────────────────

export type FranjaOpcion = {
  id: number;
  dia: number;
  hora: string;   // "16:30"
  horaFin: string;
  profesorId: string | null;
  cancha: string | null;
};

export type GrupoOpcion = {
  id: number;
  academiaId: number;
  nombre: string;
  nivel: string;
  edadMin: number;
  edadMax: number;
  franjas: FranjaOpcion[];
};

export type AcademiaOpcion = { id: number; nombre: string; deporte: string | null };

export type PrepararAcademia = {
  academias: AcademiaOpcion[];
  grupos: GrupoOpcion[];
  profesores: { id: string; nombre: string }[];
};

/**
 * Academias activas con SUS GRUPOS y las franjas de cada grupo, más los
 * profesores. Todo de una vez: son 4 academias, 9 grupos y 64 franjas, y el
 * modal las necesita todas para proponer qué clases crear dentro del bloqueo.
 */
export async function prepararAcademia(): Promise<PrepararAcademia> {
  await requireRole(WRITE);
  const supabase = await createClient();

  const profesores = (await profesoresActivos()).map((p) => ({ id: p.id, nombre: p.nombre ?? "—" }));
  const [{ data: acas }, { data: grupos }, { data: franjas }] = await Promise.all([
    supabase.from("academias").select("id, nombre, deporte").eq("activa", true).order("nombre"),
    supabase.from("academia_grupo").select("id, academia_id, nombre, nivel, edad_min, edad_max").eq("activo", true).order("nombre"),
    supabase
      .from("grupo_franja")
      .select("id, grupo_id, dia_semana, hora_inicio, hora_fin, profesor_id, cancha")
      .eq("activo", true)
      .order("dia_semana")
      .order("hora_inicio"),
  ]);

  return {
    academias: (acas ?? []).map((a) => ({ id: a.id, nombre: a.nombre, deporte: a.deporte })),
    profesores,
    grupos: (grupos ?? []).map((g) => ({
      id: g.id,
      academiaId: g.academia_id,
      nombre: g.nombre,
      nivel: g.nivel,
      edadMin: g.edad_min,
      edadMax: g.edad_max,
      franjas: (franjas ?? [])
        .filter((f) => f.grupo_id === g.id)
        .map((f) => ({
          id: f.id,
          dia: f.dia_semana,
          hora: f.hora_inicio.slice(0, 5),
          horaFin: f.hora_fin.slice(0, 5),
          profesorId: f.profesor_id,
          cancha: f.cancha,
        })),
    })),
  };
}

export async function materializarAcademia(input: {
  bookingId: string;
  fecha: string;
  deporte: "tenis" | "padel" | null;
  cancha: string;
  /** Override: si viene, manda sobre el profesor de cada franja. */
  profesorId: string;
  clases: { grupoId: number; inicio: string; fin: string; profesorId: string | null }[];
}): Promise<CierreLikeState> {
  await requireRole(WRITE);
  const supabase = await createClient();

  if (!input.clases.length) return { error: "Escoge al menos una clase que registrar." };

  const { data: existe } = await supabase
    .from("clases")
    .select("id")
    .eq("easycancha_booking_id", input.bookingId)
    .limit(1)
    .maybeSingle();
  if (existe) return { error: "Este bloqueo ya estaba registrado como clase." };

  const ids = [...new Set(input.clases.map((c) => c.grupoId))];
  const { data: grupos } = await supabase
    .from("academia_grupo")
    .select("id, nombre, academia_id")
    .in("id", ids);
  const porId = new Map((grupos ?? []).map((g) => [g.id, g]));
  if (ids.some((id) => !porId.has(id))) return { error: "Algún grupo ya no existe." };

  const filas = input.clases.map((c) => {
    const g = porId.get(c.grupoId)!;
    return {
      tipo: "academia" as const,
      academia_id: g.academia_id,
      grupo_id: g.id,
      // Cada franja ya sabe quién la dicta; lo que se escoja en el modal manda
      // (hoy puede estar cubriendo un suplente).
      profesor_id: input.profesorId || c.profesorId || null,
      deporte: input.deporte,
      cancha: input.cancha || null,
      fecha: input.fecha,
      hora_inicio: c.inicio || null,
      hora_fin: c.fin || null,
      precio: 0,
      estado: "programada" as const,
      easycancha_booking_id: input.bookingId,
    };
  });

  const { error } = await supabase.from("clases").insert(filas);
  if (error) return { error: error.message };

  await logAudit({
    action: "clase.academia",
    entity: "clases",
    entityId: input.bookingId,
    after: { easycancha_booking_id: input.bookingId, clases: filas.length, grupos: ids },
  });
  revalidatePath("/clases");
  revalidatePath("/cierre");

  const nombres = [...new Set(ids.map((id) => porId.get(id)!.nombre))];
  return {
    ok: filas.length === 1
      ? `Clase de ${nombres[0]} registrada. Ya aparece en clases por cerrar.`
      : `${filas.length} clases registradas (${nombres.join(", ")}). Ya aparecen en clases por cerrar.`,
  };
}
