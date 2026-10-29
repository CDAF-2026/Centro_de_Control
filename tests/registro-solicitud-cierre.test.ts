import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

/**
 * Una solicitud de datos que quedó en revisión solo por su facturación se cierra sola al decidir el
 * último cambio (28-oct-2026, migración 20261028200000). Antes se quedaba "En revisión · N de
 * facturación por aprobar" para siempre. Todo dentro de transacciones que se revierten.
 */
const client = new pg.Client({
  host: process.env.PGHOST, port: Number(process.env.PGPORT) || 5432, user: process.env.PGUSER,
  password: process.env.PGPASSWORD, database: process.env.PGDATABASE, ssl: { rejectUnauthorized: false },
});
let superadminId: string | undefined;
beforeAll(async () => {
  await client.connect();
  const r = await client.query("select id from public.profiles where activo and role = 'superadmin' limit 1");
  superadminId = r.rows[0]?.id;
});
afterAll(async () => { await client.end(); });

async function tx<T>(fn: () => Promise<T>): Promise<T> {
  await client.query("begin");
  try { return await fn(); } finally { await client.query("rollback"); }
}
async function ficha(): Promise<number> {
  const r = await client.query("insert into public.clientes (nombres, apellidos, documento, es_menor) values ('Ana', 'Prueba Cierre', '9990000301', false) returning id::int");
  return r.rows[0].id;
}
async function solicitud(clienteId: number | null): Promise<string> {
  const r = await client.query(
    "insert into public.registro_solicitud (tipo, estado, cliente_id, payload) values ('datos', 'en_revision', $1, '{}') returning id",
    [clienteId],
  );
  return r.rows[0].id;
}
async function cambio(solicitudId: string, clienteId: number, campo: string, valor: string): Promise<number> {
  const r = await client.query(
    "insert into public.registro_cambio (solicitud_id, cliente_id, campo, valor_nuevo) values ($1, $2, $3, $4) returning id::int",
    [solicitudId, clienteId, campo, valor],
  );
  return r.rows[0].id;
}
const estado = async (id: string) =>
  (await client.query("select estado::text, revisada_por, revisada_el is not null as revisada from public.registro_solicitud where id = $1", [id])).rows[0];

describe("solicitud de datos con facturación en revisión", () => {
  it("se cierra al aprobar desde la bandeja, y no antes", async () => {
    await tx(async () => {
      await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: superadminId, role: "authenticated" })]);
      const f = await ficha();
      const s = await solicitud(f);
      const nit = await cambio(s, f, "factura_a_nit", "9990000310");
      const nombre = await cambio(s, f, "factura_a_nombre", "Ana Prueba Cierre");
      // Otra solicitud de la misma ficha, todavía pendiente: no la cierra decidir la primera.
      const s2 = await solicitud(f);
      await cambio(s2, f, "factura_email", "ana@prueba.test");

      await client.query("update public.registro_cambio set estado = 'aprobado' where id = $1", [nit]);
      expect((await estado(s)).estado).toBe("en_revision");

      await client.query("select public.registro_facturacion_decidir($1::bigint[], true)", [[nombre]]);
      expect(await estado(s)).toEqual({ estado: "aplicada", revisada_por: superadminId, revisada: true });
      expect((await estado(s2)).estado).toBe("en_revision");
    });
  });

  it("rechazar también la cierra (los datos ya se aplicaron; solo la facturación no)", async () => {
    await tx(async () => {
      const f = await ficha();
      const s = await solicitud(f);
      const c = await cambio(s, f, "factura_a_nit", "9990000311");
      await client.query("update public.registro_cambio set estado = 'rechazado' where id = $1", [c]);
      expect((await estado(s)).estado).toBe("aplicada");
    });
  });

  it("no toca una solicitud sin ficha (las ambiguas se deciden en su propia tarjeta)", async () => {
    await tx(async () => {
      const f = await ficha();
      const s = await solicitud(null);
      const c = await cambio(s, f, "factura_a_nit", "9990000312");
      await client.query("update public.registro_cambio set estado = 'aprobado' where id = $1", [c]);
      expect((await estado(s)).estado).toBe("en_revision");
    });
  });
});
