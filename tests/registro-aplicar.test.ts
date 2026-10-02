import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

/**
 * `registro_aplicar_datos` (Fase 3, plan §4.5): crear ficha, hermano en ficha
 * existente, sobrescribir con `before` en auditoría, y facturación a revisión.
 * Todo dentro de UNA transacción que se revierte; documentos 9990000xxx inventados.
 */
const client = new pg.Client({
  host: process.env.PGHOST, port: Number(process.env.PGPORT) || 5432, user: process.env.PGUSER,
  password: process.env.PGPASSWORD, database: process.env.PGDATABASE, ssl: { rejectUnauthorized: false },
});
beforeAll(async () => { await client.connect(); });
afterAll(async () => { await client.end(); });

async function tx<T>(fn: () => Promise<T>): Promise<T> {
  await client.query("begin");
  try { return await fn(); } finally { await client.query("rollback"); }
}
async function solicitud(payload: unknown): Promise<string> {
  const r = await client.query("insert into public.registro_solicitud (tipo, payload) values ('datos', $1::jsonb) returning id", [JSON.stringify(payload)]);
  return r.rows[0].id;
}
async function aplicar(sol: string, decision: unknown) {
  const r = await client.query("select public.registro_aplicar_datos($1, $2::jsonb) as r", [sol, JSON.stringify(decision)]);
  return r.rows[0].r as { cliente_id: number; miembro_id: number; creada: boolean; cambios_pendientes: number };
}
const MENOR = { nombres: "Prueba", apellidos: "Aplicar QR", tipo_documento: "TI", documento: "9990000011", fecha_nacimiento: "2015-02-02", lugar_nacimiento: "Rionegro", eps: "Sura", rh: "O+", deportes: ["tenis"] };
const FAMILIA = { direccion: "Calle 1", celular: "3000000011", email: "papa.prueba@example.com", emergencia_nombre: "Tía", emergencia_celular: "3000000012", emergencia_parentesco: "Tía" };
const PADRE = { rol: "padre", nombre: "Papá Prueba", documento: "9990000012", telefono: "3000000011", email: "papa.prueba@example.com", principal: true };
const MADRE = { rol: "madre", nombre: "Mamá Prueba", documento: "9990000013", telefono: "3000000013" };

describe("registro_aplicar_datos", () => {
  it("crear: ficha nueva con el niño de titular, padre principal y madre, y facturación directa", async () => {
    await tx(async () => {
      const s = await solicitud({ menor: MENOR, familia: FAMILIA, acudientes: [PADRE, MADRE], facturacion: { factura_tipo: "natural", factura_a_nombre: "Papá Prueba", factura_a_nit: "9990000012", factura_email: "papa.prueba@example.com" } });
      const r = await aplicar(s, { modo: "crear" });
      expect(r.creada).toBe(true);
      expect(r.cambios_pendientes).toBe(0);
      const c = await client.query("select es_menor, acudiente_id, direccion, factura_a_nit, lugar_nacimiento from public.clientes where id = $1", [r.cliente_id]);
      expect(c.rows[0]).toMatchObject({ es_menor: true, direccion: "Calle 1", factura_a_nit: "9990000012", lugar_nacimiento: "Rionegro" });
      const a = await client.query("select rol, cliente_id from public.acudientes where cliente_id = $1 order by rol", [r.cliente_id]);
      expect(a.rows.map((x) => x.rol).sort()).toEqual(["madre", "padre"]);
      const p = await client.query("select rol from public.acudientes where id = $1", [c.rows[0].acudiente_id]);
      expect(p.rows[0].rol).toBe("padre");
      const m = await client.query("select es_titular, lugar_nacimiento from public.cliente_miembros where id = $1", [r.miembro_id]);
      expect(m.rows[0]).toMatchObject({ es_titular: true, lugar_nacimiento: "Rionegro" });
      // pg devuelve bigint como texto.
      const sol = await client.query("select estado, cliente_id::int as cliente_id from public.registro_solicitud where id = $1", [s]);
      expect(sol.rows[0]).toMatchObject({ estado: "aplicada", cliente_id: r.cliente_id });
    });
  });

  it("hermano: entra a la ficha existente y la madre que ya estaba se actualiza en vez de duplicarse", async () => {
    await tx(async () => {
      const r1 = await aplicar(await solicitud({ menor: MENOR, familia: FAMILIA, acudientes: [PADRE, MADRE], facturacion: {} }), { modo: "crear" });
      const r2 = await aplicar(
        await solicitud({ menor: { ...MENOR, nombres: "Hermano", documento: "9990000014", fecha_nacimiento: "2019-05-05" }, familia: { direccion: "Calle 2" }, acudientes: [{ ...MADRE, telefono: "3111111111" }], facturacion: {} }),
        { modo: "hermano", cliente_id: r1.cliente_id },
      );
      expect(r2.cliente_id).toBe(r1.cliente_id);
      expect(r2.miembro_id).not.toBe(r1.miembro_id);
      const n = await client.query("select count(*)::int as n from public.acudientes where cliente_id = $1", [r1.cliente_id]);
      expect(n.rows[0].n).toBe(2);
      const madre = await client.query("select telefono from public.acudientes where cliente_id = $1 and rol = 'madre'", [r1.cliente_id]);
      expect(madre.rows[0].telefono).toBe("3111111111");
      const c = await client.query("select direccion from public.clientes where id = $1", [r1.cliente_id]);
      expect(c.rows[0].direccion).toBe("Calle 2");
    });
  });

  it("actualizar: sobrescribe (D1) con el `before` en audit_log, y un NIT distinto va a revisión sin tocar la ficha", async () => {
    await tx(async () => {
      const r1 = await aplicar(await solicitud({ menor: MENOR, familia: FAMILIA, acudientes: [PADRE], facturacion: { factura_a_nit: "9990000012", factura_a_nombre: "Papá Prueba" } }), { modo: "crear" });
      const s3 = await solicitud({ menor: { ...MENOR, eps: "Nueva EPS", deportes: ["tenis", "padel"] }, familia: { celular: "3222222222" }, acudientes: [], facturacion: { factura_a_nombre: "Empresa SAS", factura_a_nit: "9000000001", factura_tipo: "juridica" } });
      const r3 = await aplicar(s3, { modo: "actualizar", cliente_id: r1.cliente_id, miembro_id: r1.miembro_id });
      expect(r3.cambios_pendientes).toBe(3);
      const c = await client.query("select celular, factura_a_nit, factura_a_nombre from public.clientes where id = $1", [r1.cliente_id]);
      expect(c.rows[0]).toMatchObject({ celular: "3222222222", factura_a_nit: "9990000012", factura_a_nombre: "Papá Prueba" });
      const m = await client.query("select eps, array_to_json(deportes) as deportes from public.cliente_miembros where id = $1", [r1.miembro_id]);
      expect(m.rows[0].eps).toBe("Nueva EPS"); // la ficha manda, el trigger copia al titular
      expect(m.rows[0].deportes).toEqual(["tenis", "padel"]);
      const pend = await client.query("select campo, valor_nuevo from public.registro_cambio where cliente_id = $1 and estado = 'pendiente' order by campo", [r1.cliente_id]);
      expect(pend.rows.map((x) => x.campo)).toEqual(["factura_a_nit", "factura_a_nombre", "factura_tipo"]);
      const sol = await client.query("select estado from public.registro_solicitud where id = $1", [s3]);
      expect(sol.rows[0].estado).toBe("en_revision");
      const au = await client.query("select before->>'celular' as antes from public.audit_log where action = 'registro.aplicar' and entity_id = $1 order by id desc limit 1", [String(r1.cliente_id)]);
      expect(au.rows[0].antes).toBe("3000000011");
    });
  });

  it("un NIT que ya es de OTRA ficha nunca se escribe: va a revisión aunque la ficha no tuviera NIT", async () => {
    await tx(async () => {
      const ajeno = await client.query("select documento from public.clientes where documento is not null and documento ~ '^\\d{6,}$' limit 1");
      const nit = ajeno.rows[0].documento as string;
      const r = await aplicar(await solicitud({ menor: MENOR, familia: FAMILIA, acudientes: [PADRE], facturacion: { factura_a_nit: nit, factura_a_nombre: "Otro" } }), { modo: "crear" });
      expect(r.cambios_pendientes).toBeGreaterThanOrEqual(1);
      const c = await client.query("select factura_a_nit from public.clientes where id = $1", [r.cliente_id]);
      expect(c.rows[0].factura_a_nit).toBeNull();
    });
  });

  it("un menor sin acudiente principal se rechaza (el CHECK de la ficha manda)", async () => {
    await tx(async () => {
      const s = await solicitud({ menor: MENOR, familia: FAMILIA, acudientes: [], facturacion: {} });
      await client.query("savepoint p");
      await expect(client.query("select public.registro_aplicar_datos($1, '{\"modo\":\"crear\"}'::jsonb)", [s])).rejects.toThrow(/acudiente/);
      await client.query("rollback to savepoint p");
    });
  });

  it("una solicitud ya procesada no se aplica dos veces", async () => {
    await tx(async () => {
      const s = await solicitud({ menor: MENOR, familia: FAMILIA, acudientes: [PADRE], facturacion: {} });
      await aplicar(s, { modo: "crear" });
      await client.query("savepoint p");
      await expect(client.query("select public.registro_aplicar_datos($1, '{\"modo\":\"crear\"}'::jsonb)", [s])).rejects.toThrow(/ya fue procesada/);
      await client.query("rollback to savepoint p");
    });
  });
});
