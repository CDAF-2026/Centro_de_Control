/**
 * Correo al papá (o a la persona, si firmó por sí misma) con el PDF del consentimiento
 * adjunto, apenas se firma (D5 / Fase 5.3; Laura, 2-oct-2026: adjunto, texto corto, sin copia
 * al club). Misma marca que `clase-confirmada.ts`. Sin `server-only`: es una plantilla pura con
 * pruebas; el envío lo hace `sendEmail`.
 */
function esc(s: string | null | undefined): string {
  return (s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
}

/** El logo se carga desde el sitio publicado: los correos necesitan una URL absoluta. */
const LOGO_URL = "https://alejandrofallacd.com/registro-logo.jpg";

export function consentimientoFirmadoEmail(opts: {
  /** Quien recibe el correo (el firmante). */
  firmante: string;
  /** El deportista. */
  menor: string;
  /** "2 de octubre de 2026, 3:12 p. m." (hora de Bogotá); en el correo va solo la fecha. */
  fechaTexto: string;
  firmaPorSiMismo: boolean;
}): { subject: string; html: string; filename: string } {
  const pila = opts.firmante.trim().split(/\s+/)[0] || "deportista";
  const pilaMenor = opts.menor.trim().split(/\s+/)[0] || "el deportista";
  const fecha = opts.fechaTexto.split(",")[0].trim();
  // Texto aprobado por Laura (2-oct-2026): cercano, corto, con el logo y la pelota.
  const bienvenida = opts.firmaPorSiMismo
    ? `¡Gracias por confiar en nosotros! Ya haces parte de la familia del Centro Deportivo Alejandro Falla y nos emociona acompañarte en la cancha.`
    : `¡Gracias por confiar en nosotros! <strong>${esc(pilaMenor)}</strong> ya hace parte de la familia del Centro Deportivo Alejandro Falla y nos emociona acompañarle en la cancha.`;
  const adjunto = `Te adjuntamos el consentimiento informado que firmaste hoy, <strong>${esc(fecha)}</strong>, para que lo tengas siempre a la mano.`;
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9f9f9;font-family:Arial,Helvetica,sans-serif;color:#1a1c1c;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#ffffff;border:1px solid #ececec;border-radius:12px;overflow:hidden;">
        <tr><td style="background:#1a1c1c;padding:26px 24px 22px;text-align:center;">
          <img src="${LOGO_URL}" width="72" height="72" alt="Centro Deportivo Alejandro Falla" style="display:block;margin:0 auto 14px;width:72px;height:72px;border-radius:16px;">
          <div style="color:#ffffff;font-size:13px;letter-spacing:1.5px;text-transform:uppercase;font-weight:bold;">Centro Deportivo Alejandro Falla</div>
          <div style="height:4px;width:52px;background:#d4e157;margin:10px auto 0;border-radius:2px;"></div>
        </td></tr>
        <tr><td style="padding:26px 24px;">
          <p style="margin:0 0 14px;font-size:16px;">Hola ${esc(pila)},</p>
          <p style="margin:0 0 14px;font-size:14px;line-height:1.6;">${bienvenida}</p>
          <p style="margin:0 0 14px;font-size:14px;line-height:1.6;">${adjunto}</p>
          <p style="margin:0 0 18px;font-size:14px;line-height:1.6;">Si algún dato cambia o tienes alguna duda, escríbenos o pasa por recepción: estamos para ayudarte.</p>
          <p style="margin:0;font-size:14px;line-height:1.6;">Nos vemos en la cancha 🎾</p>
        </td></tr>
        <tr><td style="background:#f4f4f4;padding:14px 24px;text-align:center;">
          <p style="margin:0;font-size:11px;color:#9ca3af;">Centro Deportivo Alejandro Falla · Mensaje automático, por favor no lo respondas.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
  const slug = opts.menor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "deportista";
  return { subject: `Consentimiento informado de ${pilaMenor} · Centro Deportivo Alejandro Falla`, html, filename: `consentimiento-${slug}.pdf` };
}
