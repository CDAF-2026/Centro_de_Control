"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { datosSchema, erroresDeCampo } from "@/lib/registro/esquemas";
import { buscarMiembro, soloDigitos } from "@/lib/registro/match";
import { buscarClienteDeReserva } from "@/lib/clientes-match";
import { hashIp, ipDelVisitante, navegadorDelVisitante } from "@/lib/registro/evidencia";
import { anotarEnSesion, crearSesion, leerSesion, type Firmante } from "@/lib/registro/sesion";
import { registroAbierto } from "@/lib/registro/version";
import { edadDesde } from "@/lib/validations/cliente";
import type { Json } from "@/lib/database.types";

export type DatosState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  /** El documento coincide con alguien de otro nombre: la pantalla ofrece confirmar (segundo intento). */
  documentoDudoso?: boolean;
};

const GENERICO = "No pudimos guardar los datos. Inténtalo de nuevo o acércate a recepción.";

/**
 * "Actualizar o ingresar datos" (R2–R4, plan §4.5). Decide a quién pertenece lo que
 * llegó con la MISMA búsqueda del consentimiento (`buscarMiembro`) y aplica todo en
 * una transacción (`registro_aplicar_datos`). Luego pasa directo a firmar (R4).
 *
 * Reglas D1: sobrescribe lo que había, salvo facturación (un NIT distinto espera
 * revisión; nunca mueve facturas de Siigo). La página nunca devuelve datos existentes.
 */
export async function enviarDatos(_prev: DatosState, formData: FormData): Promise<DatosState> {
  if (String(formData.get("sitio_web") ?? "").trim()) redirect("/registro/listo");

  // Las casillas múltiples van con getAll: Object.fromEntries se queda con la última.
  const deportes = formData.getAll("deportes").map(String).filter((d) => d === "tenis" || d === "padel");
  const parsed = datosSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Revisa los campos marcados.", fieldErrors: erroresDeCampo(parsed.error.issues) };
  const d = parsed.data;

  const edad = edadDesde(d.fechaNacimiento);
  const mayor = edad != null && edad >= 18;
  if (edad == null || edad < 0 || edad > 110) return { error: "Revisa la fecha de nacimiento.", fieldErrors: { fechaNacimiento: "Fecha inválida" } };

  // Acudiente principal: obligatorio para menores, con sus cuatro datos (D12).
  const acuDoc = soloDigitos(d.acudienteDocumento);
  if (!mayor) {
    const faltan: Record<string, string> = {};
    if (!d.acudienteNombre) faltan.acudienteNombre = "Escribe el nombre";
    if (!acuDoc) faltan.acudienteDocumento = "Escribe la cédula";
    if (!d.acudienteTelefono) faltan.acudienteTelefono = "Escribe el celular";
    if (!d.acudienteEmail) faltan.acudienteEmail = "Escribe el correo";
    if (Object.keys(faltan).length) return { error: "Faltan datos del acudiente principal.", fieldErrors: faltan };
  } else if (!d.celular || !d.email) {
    return { error: "Faltan tus datos de contacto.", fieldErrors: { ...(d.celular ? {} : { celular: "Escribe tu celular" }), ...(d.email ? {} : { email: "Escribe tu correo" }) } };
  }

  const admin = createAdminClient();
  const ip = await ipDelVisitante();
  const ua = await navegadorDelVisitante();
  const ipHash = hashIp(ip);
  const { data: permitido, error: limErr } = await admin.rpc("registro_permitido", { p_ip_hash: ipHash });
  if (limErr) { console.error("[registro] rate limit:", limErr.message); return { error: GENERICO }; }
  if (!permitido) return { error: "Demasiados intentos desde esta conexión. Espera unos minutos e inténtalo de nuevo." };
  if (!(await registroAbierto())) return { error: "El registro no está disponible en este momento." };

  // ¿A quién pertenece? (R8) Nunca se muestra lo que se encontró.
  const nombreMenor = `${d.nombres} ${d.apellidos}`.trim();
  const busqueda = await buscarMiembro(admin, { documento: d.documento, nombres: d.nombres, apellidos: d.apellidos, fechaNacimiento: d.fechaNacimiento });

  // El correo y el celular de la ficha son los del acudiente principal (como hoy en las fichas).
  const contactoEmail = mayor ? (d.email ?? "") : (d.acudienteEmail ?? "");
  const contactoCel = mayor ? (d.celular ?? "") : (d.acudienteTelefono ?? "");

  // El documento es de alguien con OTRO nombre (casi siempre el papá puso su propia cédula):
  // se frena con un mensaje que no revela nada. Si confirma, se guarda SIN tocar a nadie y
  // va a la bandeja (Laura, 2-oct-2026).
  const confirmado = d.confirmoDocumento === "on";
  if (busqueda.tipo === "documento_ajeno" && !confirmado) {
    return { error: "Revisa el documento: no coincide con el nombre que escribiste. Escríbelos tal como aparecen en el documento de identidad.", fieldErrors: { documento: "No coincide con el nombre" }, documentoDudoso: true };
  }

  let decision: { modo: "crear" | "hermano" | "actualizar"; cliente_id?: number; miembro_id?: number } | null = null;
  let candidatos: number[] | null = null;
  if (busqueda.tipo === "unico") {
    decision = { modo: "actualizar", cliente_id: busqueda.miembro.cliente_id, miembro_id: busqueda.miembro.miembro_id };
  } else if (busqueda.tipo === "ambiguo" || busqueda.tipo === "documento_ajeno") {
    candidatos = busqueda.candidatos.map((c) => c.miembro_id);
  } else {
    // Niño nuevo: ¿la familia ya existe? Por el adulto (correo → cédula) o por la cédula del acudiente.
    // Si existe, el niño entra como miembro NO titular de esa ficha: "hijo" cuando el titular es el
    // papá o la mamá (ficha de adulto, como "Agregar hijo"), "hermano" cuando el titular es otro niño.
    // En la base es lo mismo (modo "hermano"); solo cambia cómo lo nombra la pantalla.
    const adulto = await buscarClienteDeReserva(admin, { email: contactoEmail, documento: mayor ? d.documento : acuDoc });
    let clienteId = adulto?.id ?? null;
    if (!clienteId && acuDoc) {
      const { data: a } = await admin.from("acudientes").select("cliente_id").eq("documento", acuDoc).not("cliente_id", "is", null).limit(1).maybeSingle();
      clienteId = a?.cliente_id ?? null;
    }
    decision = clienteId ? { modo: "hermano", cliente_id: clienteId } : { modo: "crear" };
  }

  const acudientes = mayor
    ? []
    : [
        { rol: d.acudienteRol ?? "otro", nombre: d.acudienteNombre, documento: acuDoc, telefono: d.acudienteTelefono, email: d.acudienteEmail?.toLowerCase() || null, parentesco: d.acudienteParentesco || null, principal: true },
        ...(d.acudiente2Nombre
          ? [{ rol: d.acudiente2Rol ?? "otro", nombre: d.acudiente2Nombre, documento: soloDigitos(d.acudiente2Documento), telefono: d.acudiente2Telefono || null, email: d.acudiente2Email?.toLowerCase() || null, parentesco: d.acudiente2Parentesco || null, principal: false }]
          : []),
      ];

  const payload: Json = {
    menor: { nombres: d.nombres, apellidos: d.apellidos, tipo_documento: d.tipoDocumento, documento: d.documento, fecha_nacimiento: d.fechaNacimiento, lugar_nacimiento: d.lugarNacimiento || null, eps: d.eps, rh: d.rh || null, deportes },
    familia: { direccion: d.direccion || null, celular: contactoCel || null, email: contactoEmail.toLowerCase() || null, emergencia_nombre: d.emergenciaNombre || null, emergencia_celular: d.emergenciaCelular || null, emergencia_parentesco: d.emergenciaParentesco || null },
    acudientes,
    facturacion: { factura_tipo: d.facturaTipo || null, factura_a_nombre: d.facturaANombre || null, factura_a_nit: soloDigitos(d.facturaANit), factura_email: d.facturaEmail?.toLowerCase() || null },
    busqueda: busqueda.tipo === "unico" ? { tipo: "unico", por: busqueda.por } : busqueda.tipo === "ninguno" ? { tipo: "ninguno", modo: decision?.modo } : { tipo: busqueda.tipo, candidatos },
  };

  const sesionActual = await leerSesion();
  const firmante: Firmante = mayor
    ? { nombre: nombreMenor, documento: d.documento, celular: d.celular, email: d.email?.toLowerCase() }
    : { nombre: d.acudienteNombre!, documento: acuDoc!, parentesco: d.acudienteRol === "madre" ? "Madre" : d.acudienteRol === "padre" ? "Padre" : d.acudienteParentesco || "Acudiente", celular: d.acudienteTelefono, email: d.acudienteEmail?.toLowerCase() };
  const sesionId = sesionActual?.id ?? (await crearSesion(firmante));

  const { data: sol, error: solErr } = await admin
    .from("registro_solicitud")
    .insert({ sesion_id: sesionId, tipo: "datos", estado: candidatos ? "en_revision" : "recibida", payload, ip_hash: ipHash, user_agent: ua })
    .select("id")
    .single();
  if (solErr || !sol) { console.error("[registro] solicitud datos:", solErr?.message); return { error: GENERICO }; }

  let miembro = { miembro_id: 0, cliente_id: 0 };
  if (decision) {
    const { data: r, error } = await admin.rpc("registro_aplicar_datos", { p_solicitud: sol.id, p_decision: decision as unknown as Json });
    if (error || !r) { console.error("[registro] aplicar:", sol.id, error?.message); return { error: GENERICO }; }
    miembro = { miembro_id: r.miembro_id, cliente_id: r.cliente_id };
    if (r.cambios_pendientes > 0) {
      await avisarRevisores(admin, `Aviso automático · ${firmante.nombre} propuso cambiar la facturación de la ficha de ${nombreMenor}. Hay ${r.cambios_pendientes} cambio(s) por aprobar en Clientes › Registros.`);
    }
  } else if (busqueda.tipo === "documento_ajeno") {
    await avisarRevisores(admin, `Aviso automático · ${firmante.nombre} registró a ${nombreMenor} con un documento que en la plataforma tiene otra persona, y confirmó que es correcto. No se tocó ninguna ficha: revisar en Clientes › Registros.`);
  } else {
    // Caso extremo (D3): dos fichas con el mismo documento y nombre. No se escribe en clientes.
    await avisarRevisores(admin, `Aviso automático · Los datos de ${nombreMenor} enviados por ${firmante.nombre} coinciden con más de una ficha. Revisar en Clientes › Registros.`);
  }

  await anotarEnSesion(sesionId, {
    firmante,
    miembro: {
      ...miembro, nombre: nombreMenor, firmado: false,
      datos: { nombres: d.nombres, apellidos: d.apellidos, tipoDocumento: d.tipoDocumento, documento: d.documento, fechaNacimiento: d.fechaNacimiento, eps: d.eps, rh: d.rh ?? "", confirmado: confirmado || undefined },
    },
  });

  redirect("/registro/consentimiento");
}

/** Nota "Aviso automático" a los revisores (SA y coord. admin), igual que en el consentimiento. */
async function avisarRevisores(admin: ReturnType<typeof createAdminClient>, texto: string): Promise<void> {
  const { data: nota, error } = await admin.from("notas").insert({ texto, autor_id: null, prioridad: "normal" }).select("id").single();
  if (error || !nota) { console.error("[registro] aviso:", error?.message); return; }
  const { data: perfiles } = await admin.from("profiles").select("id").in("role", ["superadmin", "coord_admin"]).eq("activo", true);
  if (perfiles?.length) await admin.from("nota_destinatarios").insert(perfiles.map((p) => ({ nota_id: nota.id, perfil_id: p.id })));
}
