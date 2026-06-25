/** Correo (HTML branded CDAF) de bienvenida cuando se asigna un paquete a un cliente. */

function esc(s: string | null | undefined): string {
  return (s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
}

export function paqueteAsignadoEmail(opts: {
  nombre: string | null;
  paquete: string;
  numClases: number;
  vence: string | null;
}): { subject: string; html: string } {
  const box = `<div style="margin:20px 0;padding:16px 18px;background:#f4f8d8;border-left:4px solid #d4e157;border-radius:8px;">
    <p style="margin:0;font-size:14px;line-height:1.6;color:#1a1c1c;">
      Tienes <strong style="font-size:20px;">${opts.numClases}</strong> clases disponibles${
        opts.vence ? ` · vigencia hasta <strong>${esc(opts.vence)}</strong>` : ""
      }.
    </p>
  </div>`;

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9f9f9;font-family:Arial,Helvetica,sans-serif;color:#1a1c1c;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#ffffff;border:1px solid #ececec;border-radius:12px;overflow:hidden;">
        <tr><td style="background:#1a1c1c;padding:22px 24px;">
          <div style="color:#ffffff;font-size:13px;letter-spacing:1.5px;text-transform:uppercase;font-weight:bold;">Centro Deportivo Alejandro Falla</div>
          <div style="height:4px;width:52px;background:#d4e157;margin-top:10px;border-radius:2px;"></div>
        </td></tr>
        <tr><td style="padding:26px 24px;">
          <p style="margin:0 0 14px;font-size:16px;">Hola ${esc(opts.nombre) || "deportista"},</p>
          <p style="margin:0;font-size:14px;line-height:1.6;">
            ¡Bienvenido a tu nuevo paquete <strong>${esc(opts.paquete)}</strong>! 🎾
          </p>
          ${box}
          <p style="margin:18px 0 0;font-size:12px;color:#6b7280;line-height:1.5;">Cada vez que cierres una clase te avisaremos cuántas te quedan. ¡Nos vemos en la cancha!</p>
        </td></tr>
        <tr><td style="background:#f4f4f4;padding:14px 24px;text-align:center;">
          <p style="margin:0;font-size:11px;color:#9ca3af;">Centro Deportivo Alejandro Falla · Mensaje automático, por favor no lo respondas.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  return { subject: "¡Bienvenido a tu nuevo paquete! 🎾 · CDAF", html };
}
