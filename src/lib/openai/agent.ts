/**
 * Agente analítico del Centro de Control (OpenAI chat). Server-side.
 * Enfoque seguro: se le entregan MÉTRICAS YA CALCULADAS (JSON) y responde sobre
 * ellas; no genera SQL ni accede crudo a la base.
 */
export async function askAgent(question: string, contextoJson: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Falta OPENAI_API_KEY.");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "Eres el asistente analítico del Centro de Control del Centro Deportivo Alejandro Falla (CDAF). " +
            "Responde en español, claro y conciso, ÚNICAMENTE con base en los DATOS (JSON) que se te entregan. " +
            "Si la pregunta no se puede responder con esos datos, dilo con claridad y NO inventes cifras.",
        },
        {
          role: "user",
          content: `DATOS ACTUALES (JSON):\n${contextoJson}\n\nPREGUNTA: ${question}`,
        },
      ],
    }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message ?? `OpenAI HTTP ${res.status}`);
  return json?.choices?.[0]?.message?.content?.trim() ?? "Sin respuesta.";
}
