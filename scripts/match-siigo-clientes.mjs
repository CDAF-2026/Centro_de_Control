/**
 * Backfillea la cédula (documento) de nuestros clientes cruzando por nombre con
 * los clientes de Siigo (donde NIT = cédula). Solo personas, cédula 6-10 dígitos,
 * y solo cuando el match de nombre es ÚNICO. Idempotente: no toca clientes que ya
 * tienen documento. Tras correrlo, `npm run sync:siigo --full` enlaza sus facturas.
 *
 * Uso: node --env-file=.env scripts/match-siigo-clientes.mjs [--apply]
 *   (sin --apply = dry-run; con --apply = escribe)
 */
import { createClient } from "@supabase/supabase-js";

const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const U = process.env.SIIGO_USERNAME, K = process.env.SIIGO_ACCESS_KEY, PID = "CentroDeControlCDAF";
const APPLY = process.argv.includes("--apply");

const norm = (x) => (x || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const toks = (x) => norm(x).split(" ").filter((t) => t.length > 1);
const subset = (a, b) => a.every((t) => b.includes(t));

const auth = await (await fetch("https://api.siigo.com/auth", { method: "POST", headers: { "Content-Type": "application/json", "Partner-Id": PID }, body: JSON.stringify({ username: U, access_key: K }) })).json();
const H = { Authorization: `Bearer ${auth.access_token}`, "Partner-Id": PID };

const siigo = [];
for (let page = 1; ; page++) {
  const r = await (await fetch(`https://api.siigo.com/v1/customers?page=${page}&page_size=100`, { headers: H })).json();
  const res = r.results ?? [];
  for (const c of res) {
    const nit = String(c.identification || "").trim();
    const nom = Array.isArray(c.name) ? c.name.filter(Boolean).join(" ") : c.name || "";
    if (c.person_type === "Person" && /^\d{6,10}$/.test(nit) && !/^(\d)\1+$/.test(nit)) siigo.push({ nit, nombre: nom, tk: toks(nom) });
  }
  if (res.length < 100) break;
}

const { data: clientes } = await s.from("clientes").select("id, nombres, apellidos, documento");
let aplicados = 0, ambiguos = 0;
for (const c of clientes ?? []) {
  if (c.documento) continue;
  const ct = toks(`${c.nombres} ${c.apellidos ?? ""}`);
  if (ct.length < 2) continue;
  const cands = siigo.filter((x) => x.tk.length >= 2 && (subset(x.tk, ct) || subset(ct, x.tk)) && ct.filter((t) => x.tk.includes(t)).length >= 2);
  const nits = [...new Set(cands.map((x) => x.nit))];
  if (nits.length === 1) {
    console.log(`${APPLY ? "✔" : "•"} ${c.nombres} ${c.apellidos ?? ""}  →  ${cands[0].nombre} (${nits[0]})`);
    if (APPLY) {
      const { error } = await s.from("clientes").update({ documento: nits[0] }).eq("id", c.id);
      if (error) console.error("  error:", error.message);
      else aplicados++;
    } else aplicados++;
  } else if (nits.length > 1) ambiguos++;
}
console.log(`\n${APPLY ? "Aplicados" : "Se aplicarían"}: ${aplicados} · ambiguos (omitidos): ${ambiguos}`);
if (!APPLY) console.log("Dry-run. Corre con --apply para escribir.");
