import { CORREO_CLUB } from "./club";

/**
 * Aviso al club cuando el papá (o la mamá, o el representante) NO autoriza fotos y videos del menor al firmar
 * el consentimiento (casilla desde el 18-oct-2026, pedido del club): así saben de quién no pueden usar fotos.
 * Va a `CORREO_CLUB`. Sin `server-only`: es una plantilla pura con pruebas; el envío lo hace `sendEmail`.
 */
function esc(s: string | null | undefined): string {
  return (s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
}

const SITIO = "https://alejandrofallacd.com";

export function noAutorizoImagenEmail(opts: {
  /** El deportista (nombre completo). */
  menor: string;
  /** "TI 1020320895". */
  menorDocumento: string;
  firmante: string;
  firmanteDocumento: string;
  /** "madre", "padre" o "representante legal". */
  calidad: string;
  /** "18 de octubre de 2026, 3:12 p. m." (hora de Bogotá). */
  fechaTexto: string;
  /** Ficha del deportista; null si el consentimiento quedó en revisión sin ficha asignada. */
  clienteId: number | null;
}): { to: string; subject: string; html: string } {
  const enlace = opts.clienteId != null ? `${SITIO}/clientes/${opts.clienteId}` : `${SITIO}/clientes/registros`;
  const textoEnlace = opts.clienteId != null ? "Ver la ficha del deportista" : "Ver los registros por revisar";
  const quien = `${esc(opts.firmante)} (${[opts.calidad, `CC ${opts.firmanteDocumento}`].filter(Boolean).map(esc).join(", ")})`;
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9f9f9;font-family:Arial,Helvetica,sans-serif;color:#1a1c1c;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#ffffff;border:1px solid #ececec;border-radius:12px;overflow:hidden;">
        <tr><td style="background:#1a1c1c;padding:18px 24px;">
          <div style="color:#ffffff;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;font-weight:bold;">Aviso automático · Fotos y videos</div>
        </td></tr>
        <tr><td style="padding:24px;">
          <p style="margin:0 0 14px;font-size:14px;line-height:1.6;"><strong>${quien}</strong> <strong>no autorizó</strong> el uso de fotos y videos de <strong>${esc(opts.menor)}</strong> (${esc(opts.menorDocumento)}) al firmar el consentimiento informado el ${esc(opts.fechaTexto)}.</p>
          <p style="margin:0 0 18px;font-size:14px;line-height:1.6;">No se deben publicar fotos ni videos en los que aparezca ${esc(opts.menor.trim().split(/\s+/)[0] || "el deportista")}. A la familia también se le informó por correo.</p>
          <p style="margin:0;"><a href="${enlace}" style="display:inline-block;background:#d4e157;color:#1a1c1c;font-weight:bold;font-size:14px;text-decoration:none;padding:10px 16px;border-radius:8px;">${textoEnlace}</a></p>
        </td></tr>
        <tr><td style="background:#f4f4f4;padding:14px 24px;text-align:center;">
          <p style="margin:0;font-size:11px;color:#9ca3af;">Centro de Control · Centro Deportivo Alejandro Falla · Mensaje automático.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
  return { to: CORREO_CLUB, subject: `No autorizó fotos y videos · ${opts.menor.trim()}`, html };
}
