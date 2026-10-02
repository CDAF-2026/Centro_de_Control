"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { consentimientoSchema, erroresDeCampo } from "@/lib/registro/esquemas";
import { buscarMiembro, soloDigitos } from "@/lib/registro/match";
import { hashIp, ipDelVisitante, navegadorDelVisitante, sha256 } from "@/lib/registro/evidencia";
import { anotarEnSesion, crearSesion, leerSesion } from "@/lib/registro/sesion";
import { registroAbierto } from "@/lib/registro/version";
import { generarPdfConsentimiento } from "@/lib/pdf/consentimiento-pdf";
import { logAuditSistema } from "@/lib/audit";
import { edadDesde } from "@/lib/validations/cliente";
import { capitalizarNombre } from "@/lib/nombres";
import type { Json } from "@/lib/database.types";

export type ConsentimientoState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  /** No hay ficha con esos datos: se le ofrece llenar los datos primero (D3). */
  noEncontrado?: boolean;
  /** El documento coincide con alguien de otro nombre: la pantalla ofrece confirmar (segundo intento). */
  documentoDudoso?: boolean;
};

const GENERICO = "No pudimos guardar la firma. Inténtalo de nuevo o acércate a recepción.";

/**
 * Nota "Aviso automático" a los revisores (D8: superadmin y coord. administrativo).
 * `private.nota_sistema_roles` no se alcanza por PostgREST (esquema private), así
 * que se escribe igual que ella pero desde aquí: nota sin autor + destinatarios.
 */
async function avisarRevisores(admin: ReturnType<typeof createAdminClient>, texto: string): Promise<void> {
  const { data: nota, error } = await admin.from("notas").insert({ texto, autor_id: null, prioridad: "normal" }).select("id").single();
  if (error || !nota) {
    console.error("[registro] aviso:", error?.message);
    return;
  }
  const { data: perfiles } = await admin.from("profiles").select("id").in("role", ["superadmin", "coord_admin"]).eq("activo", true);
  if (perfiles?.length) {
    await admin.from("nota_destinatarios").insert(perfiles.map((p) => ({ nota_id: nota.id, perfil_id: p.id })));
  }
}

/**
 * El camino completo de una firma (plan §4.2 y §4.8). Sin sesión ni rol: lo que
 * protege son zod, el rate limit, los RPC (solo service_role) y que la página
 * NUNCA devuelve datos existentes.
 *
 * Orden, y por qué: firma en la base → PNG → PDF → adjuntar. Si el PDF falla, la
 * firma ya existe con su evidencia y se regenera; lo contrario (archivo sin fila)
 * sería un papel sin dueño.
 */
export async function firmarConsentimiento(
  _prev: ConsentimientoState,
  formData: FormData,
): Promise<ConsentimientoState> {
  // Honeypot: se responde "listo" sin guardar nada y sin avisarle al robot.
  if (String(formData.get("sitio_web") ?? "").trim()) redirect("/registro/listo");

  const parsed = consentimientoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Revisa los campos marcados.", fieldErrors: erroresDeCampo(parsed.error.issues) };
  }
  const d = parsed.data;
  const admin = createAdminClient();

  const ip = await ipDelVisitante();
  const ua = await navegadorDelVisitante();
  const ipHash = hashIp(ip);

  const { data: permitido, error: limErr } = await admin.rpc("registro_permitido", { p_ip_hash: ipHash });
  if (limErr) {
    console.error("[registro] rate limit:", limErr.message);
    return { error: GENERICO };
  }
  if (!permitido) return { error: "Demasiados intentos desde esta conexión. Espera unos minutos e inténtalo de nuevo." };

  const version = await registroAbierto();
  if (!version) return { error: "El consentimiento no está disponible en este momento." };

  // D11: con 18 o más firma por sí mismo; el firmante es la persona.
  const edad = edadDesde(d.fechaNacimiento);
  const mayor = edad != null && edad >= 18;
  const nombreMenor = `${capitalizarNombre(d.nombres)} ${capitalizarNombre(d.apellidos)}`.trim();
  const firmante = mayor
    ? { nombre: nombreMenor, documento: d.documento, parentesco: null as string | null, celular: d.firmanteCelular || null, email: d.firmanteEmail || null }
    : {
        nombre: capitalizarNombre(d.firmanteNombre),
        documento: soloDigitos(d.firmanteDocumento) ?? "",
        parentesco: d.firmanteParentesco || null,
        celular: d.firmanteCelular || null,
        email: d.firmanteEmail || null,
      };
  if (!mayor && (!firmante.nombre || !firmante.documento)) {
    return {
      error: "Faltan los datos de quien firma.",
      fieldErrors: { ...(firmante.nombre ? {} : { firmanteNombre: "Escribe tu nombre" }), ...(firmante.documento ? {} : { firmanteDocumento: "Escribe tu cédula" }) },
    };
  }

  // ¿De quién es esta firma? (R8) Nunca se muestra lo que se encontró.
  const busqueda = await buscarMiembro(admin, {
    documento: d.documento, nombres: d.nombres, apellidos: d.apellidos, fechaNacimiento: d.fechaNacimiento,
  });
  if (busqueda.tipo === "ninguno") return { noEncontrado: true };

  const sesion = (await leerSesion()) ?? null;

  // Documento de alguien con OTRO nombre: se frena; si confirma (aquí o ya lo hizo en
  // "Actualizar datos"), la firma queda pendiente de asignar y nadie se toca.
  const confirmado = d.confirmoDocumento === "on" || !!sesion?.miembros.some((m) => m.datos?.documento === d.documento && m.datos?.confirmado);
  if (busqueda.tipo === "documento_ajeno" && !confirmado) {
    return { error: "Revisa el documento: no coincide con el nombre que escribiste. Escríbelos tal como aparecen en el documento de identidad.", fieldErrors: { documento: "No coincide con el nombre" }, documentoDudoso: true };
  }

  // Se firma UNA vez por niño y versión (D6). Si ya hay una firma vigente con su PDF, no se
  // crea otra: se da por hecho. Si la hay pero sin PDF (falló a mitad de camino), se retoma
  // esa misma firma en vez de duplicarla.
  let firmaPrevia: { id: string; firmado_el: string; pdf_path: string | null } | null = null;
  if (busqueda.tipo === "unico") {
    const { data: previa } = await admin
      .from("consentimiento_firma")
      .select("id, firmado_el, pdf_path")
      .eq("miembro_id", busqueda.miembro.miembro_id)
      .eq("version_id", version.id)
      .eq("estado", "asignada")
      .order("firmado_el", { ascending: false })
      .limit(1)
      .maybeSingle();
    firmaPrevia = previa ?? null;
    if (firmaPrevia?.pdf_path) {
      const sesionId = sesion?.id ?? (await crearSesion({ nombre: firmante.nombre, documento: firmante.documento, parentesco: firmante.parentesco ?? undefined, celular: firmante.celular ?? undefined, email: firmante.email ?? undefined }));
      await anotarEnSesion(sesionId, { miembro: { miembro_id: busqueda.miembro.miembro_id, cliente_id: busqueda.miembro.cliente_id, nombre: nombreMenor, firmado: true } });
      redirect("/registro/listo?ya=1");
    }
  }
  const sesionId = sesion?.id ?? (await crearSesion({ nombre: firmante.nombre, documento: firmante.documento, parentesco: firmante.parentesco ?? undefined, celular: firmante.celular ?? undefined, email: firmante.email ?? undefined }));

  // La solicitud, tal cual llegó (sin la imagen: pesa y ya va al bucket).
  const payload: Json = {
    menor: { nombres: d.nombres, apellidos: d.apellidos, tipoDocumento: d.tipoDocumento, documento: d.documento, fechaNacimiento: d.fechaNacimiento, eps: d.eps, rh: d.rh || null },
    firmante,
    busqueda: busqueda.tipo === "unico" ? { tipo: "unico", por: busqueda.por } : { tipo: busqueda.tipo, candidatos: busqueda.candidatos.map((c) => c.miembro_id) },
  };
  const { data: sol, error: solErr } = await admin
    .from("registro_solicitud")
    .insert({
      sesion_id: sesionId, tipo: "consentimiento",
      estado: busqueda.tipo === "unico" ? "aplicada" : "en_revision",
      payload, ip_hash: ipHash, user_agent: ua,
      cliente_id: busqueda.tipo === "unico" ? busqueda.miembro.cliente_id : null,
      miembro_id: busqueda.tipo === "unico" ? busqueda.miembro.miembro_id : null,
    })
    .select("id")
    .single();
  if (solErr || !sol) {
    console.error("[registro] solicitud:", solErr?.message);
    return { error: GENERICO };
  }

  // 1) La firma, con la hora del servidor (o la previa que quedó sin PDF).
  const { data: firmaNueva, error: firmaErr } = firmaPrevia ? { data: firmaPrevia.id, error: null } : await admin.rpc("consentimiento_firmar", {
    p_datos: {
      solicitud_id: sol.id, sesion_id: sesionId,
      cliente_id: busqueda.tipo === "unico" ? busqueda.miembro.cliente_id : null,
      miembro_id: busqueda.tipo === "unico" ? busqueda.miembro.miembro_id : null,
      firmante_nombre: firmante.nombre, firmante_documento: firmante.documento,
      firmante_parentesco: firmante.parentesco, firmante_celular: firmante.celular, firmante_email: firmante.email,
      menor_nombre: nombreMenor, menor_documento: d.documento, menor_rh: d.rh || null, eps: d.eps,
      metodo: d.metodo, ip, user_agent: ua,
    },
  });
  if (firmaErr || !firmaNueva) {
    console.error("[registro] firmar:", firmaErr?.message);
    return { error: GENERICO };
  }
  const firmaId = firmaNueva;

  // 2) La imagen de la firma, 3) el PDF, 4) adjuntar. Se mira cada error.
  const { data: firma } = await admin.from("consentimiento_firma").select("firmado_el").eq("id", firmaId).single();
  const png = Buffer.from(d.firmaPng.split(",")[1], "base64");
  const pngPath = `${firmaId}/firma.png`;
  const { error: pngErr } = await admin.storage.from("consentimientos").upload(pngPath, png, { contentType: "image/png", upsert: !!firmaPrevia });
  if (pngErr) {
    console.error("[registro] png:", firmaId, pngErr.message);
    return { error: GENERICO };
  }

  let pdf: Buffer;
  try {
    pdf = await generarPdfConsentimiento({
      firmaId,
      version: { codigo: version.codigo, titulo: version.titulo, texto: version.texto, texto_sha256: version.texto_sha256 },
      menor: { nombre: nombreMenor, documento: `${d.tipoDocumento} ${d.documento}`, rh: d.rh || null, eps: d.eps },
      firmante: { nombre: firmante.nombre, documento: firmante.documento, parentesco: firmante.parentesco, email: firmante.email, celular: firmante.celular },
      firmaPorSiMismo: mayor,
      firmadoEl: firma?.firmado_el ?? new Date().toISOString(),
      metodo: d.metodo, ip, userAgent: ua, firmaPng: png,
    });
  } catch (e) {
    console.error("[registro] pdf:", firmaId, (e as Error).message);
    return { error: GENERICO };
  }
  const pdfPath = `${firmaId}/consentimiento.pdf`;
  const { error: pdfErr } = await admin.storage.from("consentimientos").upload(pdfPath, pdf, { contentType: "application/pdf", upsert: !!firmaPrevia });
  if (pdfErr) {
    console.error("[registro] pdf upload:", firmaId, pdfErr.message);
    return { error: GENERICO };
  }

  const { error: adjErr } = await admin.rpc("consentimiento_adjuntar", {
    p_firma: firmaId, p_pdf_path: pdfPath, p_png_path: pngPath, p_sha256: sha256(pdf),
  });
  if (adjErr) {
    console.error("[registro] adjuntar:", firmaId, adjErr.message);
    return { error: GENERICO };
  }

  if (busqueda.tipo === "documento_ajeno") {
    await avisarRevisores(admin, `Aviso automático · ${firmante.nombre} firmó por ${nombreMenor} con un documento que en la plataforma tiene otra persona, y confirmó que es correcto. La firma quedó sin asignar: revisar en Clientes › Registros.`);
    await logAuditSistema({
      action: "consentimiento.pendiente_asignar", entity: "consentimiento_firma", entityId: firmaId,
      after: { motivo: "documento_ajeno", candidatos: busqueda.candidatos.map((c) => c.miembro_id) },
    });
  } else if (busqueda.tipo === "ambiguo") {
    // Caso extremo (D3): mismo documento y mismo nombre en dos fichas. Avisar a los revisores.
    await avisarRevisores(admin, `Aviso automático · Un consentimiento firmado por ${firmante.nombre} para ${nombreMenor} coincide con más de una ficha. Hay que asignarlo desde la ficha correcta (Clientes).`);
    await logAuditSistema({
      action: "consentimiento.pendiente_asignar", entity: "consentimiento_firma", entityId: firmaId,
      after: { candidatos: busqueda.candidatos.map((c) => c.miembro_id) },
    });
  }

  await anotarEnSesion(sesionId, {
    miembro: {
      miembro_id: busqueda.tipo === "unico" ? busqueda.miembro.miembro_id : 0,
      cliente_id: busqueda.tipo === "unico" ? busqueda.miembro.cliente_id : 0,
      nombre: nombreMenor, firmado: true,
    },
  });

  redirect("/registro/listo");
}
