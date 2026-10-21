import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

/**
 * Varios datos de facturación por ficha (21-oct-2026, migración 20261021100000): el primero en
 * clientes.factura_*, los demás en `cliente_facturacion_extra`. Un NIT, una ficha.
 * Todo dentro de transacciones que se revierten; documentos 9990000xxx inventados.
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
async function rechazo(sql: string, params: unknown[] = []): Promise<string | null> {
  await client.query("savepoint p");
  try { await client.query(sql, params); await client.query("release savepoint p"); return null; }
  catch (e) { await client.query("rollback to savepoint p"); return (e as Error).message; }
}
async function ficha(nombres: string, documento: string, nit: string | null): Promise<number> {
  const r = await client.query(
    "insert into public.clientes (nombres, apellidos, documento, es_menor, factura_a_nit, factura_a_nombre) values ($1, 'Prueba Extra', $2, false, $3, $4) returning id::int",
    [nombres, documento, nit, nit ? "Mamá Prueba" : null],
  );
  return r.rows[0].id;
}
async function solicitud(): Promise<string> {
  const r = await client.query("insert into public.registro_solicitud (tipo, payload) values ('datos', '{}'::jsonb) returning id");
  return r.rows[0].id;
}
async function comoSuperadmin() {
  await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: superadminId, role: "authenticated" })]);
}

describe("datos de facturación adicionales", () => {
  it("un NIT, una ficha: el índice único y nit_en_uso miran los adicionales", async () => {
    await tx(async () => {
      const a = await ficha("Ana", "9990000101", "9990000110");
      const b = await ficha("Beto", "9990000102", null);
      await client.query("insert into public.cliente_facturacion_extra (cliente_id, nit) values ($1, '9990000111')", [a]);
      expect(await rechazo("insert into public.cliente_facturacion_extra (cliente_id, nit) values ($1, '9990000111')", [b])).toMatch(/duplicate key/);
      const uso = await client.query("select private.nit_en_uso('9990000111', $1)::int as otro, private.nit_en_uso('9990000111', $2) as propio", [b, a]);
      expect(uso.rows[0]).toEqual({ otro: a, propio: null });
      expect(await rechazo("insert into public.cliente_facturacion_extra (cliente_id, nit) values ($1, '99-01')", [a])).toMatch(/check/);
    });
  });

  it("QR: si el NIT ya es un adicional de la ficha, se refrescan sus datos y no va a la bandeja", async () => {
    await tx(async () => {
      const a = await ficha("Ana", "9990000101", "9990000110");
      await client.query("insert into public.cliente_facturacion_extra (cliente_id, nit, nombre) values ($1, '9990000111', 'Papá')", [a]);
      const n = await client.query("select private.registro_facturacion($1, $2, $3::jsonb) as n", [
        await solicitud(), a, JSON.stringify({ factura_a_nit: "9990000111", factura_a_nombre: "Papá Prueba", factura_email: "papa@example.com" }),
      ]);
      expect(n.rows[0].n).toBe(0);
      const e = await client.query("select nombre, email from public.cliente_facturacion_extra where cliente_id = $1", [a]);
      expect(e.rows[0]).toEqual({ nombre: "Papá Prueba", email: "papa@example.com" });
      const c = await client.query("select factura_a_nit from public.clientes where id = $1", [a]);
      expect(c.rows[0].factura_a_nit).toBe("9990000110");
    });
  });

  it("bandeja: aprobar un NIT distinto lo AGREGA y conserva el que ya tenía", async () => {
    expect(superadminId).toBeTruthy();
    await tx(async () => {
      const a = await ficha("Ana", "9990000101", "9990000110");
      const n = await client.query("select private.registro_facturacion($1, $2, $3::jsonb) as n", [
        await solicitud(), a, JSON.stringify({ factura_a_nit: "9990000112", factura_a_nombre: "Papá Prueba", factura_tipo: "natural", factura_email: "papa@example.com" }),
      ]);
      expect(n.rows[0].n).toBe(4);
      const ids = (await client.query("select array_agg(id)::int[] as ids from public.registro_cambio where cliente_id = $1 and estado = 'pendiente'", [a])).rows[0].ids;
      await comoSuperadmin();
      const r = await client.query("select public.registro_facturacion_decidir($1::bigint[], true) as r", [ids]);
      expect(r.rows[0].r.modo).toBe("agregado");
      const c = await client.query("select factura_a_nit, factura_a_nombre from public.clientes where id = $1", [a]);
      expect(c.rows[0]).toEqual({ factura_a_nit: "9990000110", factura_a_nombre: "Mamá Prueba" });
      const e = await client.query("select nit, nombre, tipo, email from public.cliente_facturacion_extra where cliente_id = $1", [a]);
      expect(e.rows).toEqual([{ nit: "9990000112", nombre: "Papá Prueba", tipo: "natural", email: "papa@example.com" }]);
      const p = await client.query("select count(*)::int as n from public.registro_cambio where id = any($1::bigint[]) and estado = 'aprobado'", [ids]);
      expect(p.rows[0].n).toBe(4);
    });
  });

  it("bandeja: sin NIT previo, aprobar deja los datos como el primero (como antes)", async () => {
    await tx(async () => {
      const a = await ficha("Ana", "9990000101", null);
      const b = await ficha("Beto", "9990000102", null);
      // El NIT lo tiene otra ficha → va a la bandeja aunque esta no tenga NIT.
      await client.query("update public.clientes set factura_a_nit = '9990000113' where id = $1", [b]);
      await client.query("select private.registro_facturacion($1, $2, $3::jsonb)", [await solicitud(), a, JSON.stringify({ factura_a_nit: "9990000113", factura_a_nombre: "Papá" })]);
      const ids = (await client.query("select array_agg(id)::int[] as ids from public.registro_cambio where cliente_id = $1 and estado = 'pendiente'", [a])).rows[0].ids;
      await comoSuperadmin();
      // Mientras sea de la otra ficha, no se aprueba (y no queda nada a medias).
      expect(await rechazo("select public.registro_facturacion_decidir($1::bigint[], true)", [ids])).toMatch(/ya es de la ficha de Beto/);
      const pend = await client.query("select count(*)::int as n from public.registro_cambio where id = any($1::bigint[]) and estado = 'pendiente'", [ids]);
      expect(pend.rows[0].n).toBe(ids.length);
      // Al soltarlo la otra ficha (p. ej. al unirlas), se aprueba como el primer dato.
      await client.query("update public.clientes set factura_a_nit = null where id = $1", [b]);
      const r = await client.query("select public.registro_facturacion_decidir($1::bigint[], true) as r", [ids]);
      expect(r.rows[0].r.modo).toBe("principal");
      const c = await client.query("select factura_a_nit, factura_a_nombre from public.clientes where id = $1", [a]);
      expect(c.rows[0]).toEqual({ factura_a_nit: "9990000113", factura_a_nombre: "Papá" });
    });
  });

  it("bandeja: solo SA o coord. administrativo decide, y no se decide dos veces", async () => {
    await tx(async () => {
      const a = await ficha("Ana", "9990000101", "9990000110");
      await client.query("select private.registro_facturacion($1, $2, $3::jsonb)", [await solicitud(), a, JSON.stringify({ factura_a_nit: "9990000114" })]);
      const ids = (await client.query("select array_agg(id)::int[] as ids from public.registro_cambio where cliente_id = $1 and estado = 'pendiente'", [a])).rows[0].ids;
      expect(await rechazo("select public.registro_facturacion_decidir($1::bigint[], true)", [ids])).toMatch(/Solo el superadministrador/);
      await comoSuperadmin();
      await client.query("select public.registro_facturacion_decidir($1::bigint[], false)", [ids]);
      expect(await rechazo("select public.registro_facturacion_decidir($1::bigint[], true)", [ids])).toMatch(/ya fueron decididos/);
      const e = await client.query("select count(*)::int as n from public.cliente_facturacion_extra where cliente_id = $1", [a]);
      expect(e.rows[0].n).toBe(0);
    });
  });
});
