import "server-only";

/**
 * Envío de correos con Resend (vía fetch, sin dependencia).
 * Server-only: la API key nunca llega al navegador. Degrada con `error` (no lanza).
 * El dominio del remitente (RESEND_FROM) debe estar verificado en Resend.
 */
export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ ok: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!key || !from) return { ok: false, error: "Resend no está configurado (RESEND_API_KEY/RESEND_FROM)." };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `Centro Deportivo Alejandro Falla <${from}>`,
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      return { ok: false, error: `Resend ${res.status}: ${t.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
