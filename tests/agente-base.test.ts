import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

/**
 * Agente IA · Fase 1, paso 1 (24-nov-2026, migraciones 20261124100000–102000): la base.
 *
 *  · La consulta libre (`agente_consulta`) es de SOLO LECTURA, solo para el
 *    superadministrador, y no ve nada fuera del esquema `agente`.
 *  · Cada superadministrador ve solo SUS conversaciones; nadie con sesión las escribe.
 *  · Los resúmenes nuevos cuadran con los RPC que ya usa el dashboard.
 *
 * Va directo a Postgres (como rls.test.ts): todo dentro de transacciones que se
 * revierten. Las consultas de prueba usan generate_series y no datos del club, para
 * no depender de un estado que el club mueve (handoff §8.H).
 */
const client = new pg.Client({
  host: process.env.PGHOST, port: Number(process.env.PGPORT) || 5432, user: process.env.PGUSER,
  password: process.env.PGPASSWORD, database: process.env.PGDATABASE, ssl: { rejectUnauthorized: false },
});

let superadmins: string[] = [];
let recepcion: string | undefined;

beforeAll(async () => {
  await client.connect();
  const sa = await client.query("select id from public.profiles where activo and role = 'superadmin' order by created_at limit 2");
  superadmins = sa.rows.map((r) => r.id);
  const re = await client.query("select id from public.profiles where activo and role = 'recepcion' limit 1");
  recepcion = re.rows[0]?.id;
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
async function como(perfil: string | undefined) {
  await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: perfil, role: "authenticated" })]);
  await client.query("set local role authenticated");
}
async function consulta(sql: string) {
  const r = await client.query("select public.agente_consulta($1) as r", [sql]);
  return r.rows[0].r as { filas: Record<string, unknown>[]; truncado: boolean };
}

describe("consulta libre del agente", () => {
  it("el superadministrador consulta y el tope es de 200 filas", async () => {
    await tx(async () => {
      await como(superadmins[0]);
      const pocas = await consulta("select g from generate_series(1, 5) g order by g desc;");
      expect(pocas).toEqual({ filas: [5, 4, 3, 2, 1].map((g) => ({ g })), truncado: false });
      const muchas = await consulta("select g from generate_series(1, 250) g");
      expect(muchas.filas).toHaveLength(200);
      expect(muchas.truncado).toBe(true);
    });
  });

  it("lee las vistas del esquema agente y cuadra con la tabla real", async () => {
    await tx(async () => {
      const real = await client.query("select count(*)::int as n from public.siigo_facturas");
      await como(superadmins[0]);
      const r = await consulta("select count(*)::int as n from siigo_facturas");
      expect(r.filas[0].n).toBe(real.rows[0].n);
    });
  });

  it("solo el superadministrador", async () => {
    await tx(async () => {
      expect(await rechazo("select public.agente_consulta('select 1')")).toMatch(/Solo el superadministrador/);
      if (recepcion) {
        await como(recepcion);
        expect(await rechazo("select public.agente_consulta('select 1')")).toMatch(/Solo el superadministrador/);
      }
    });
  });

  it("rechaza todo lo que no sea UNA consulta SELECT", async () => {
    await tx(async () => {
      await como(superadmins[0]);
      const q = (s: string) => rechazo("select public.agente_consulta($1)", [s]);
      expect(await q("delete from clientes")).toMatch(/Solo se admiten consultas SELECT/);
      expect(await q("select 1; delete from clientes")).toMatch(/sin punto y coma/);
      expect(await q("with d as (delete from clientes returning id) select * from d")).toMatch(/data-modifying/);
      expect(await q("   ")).toMatch(/vacía/);
    });
  });

  it("no ve nada fuera del esquema agente", async () => {
    await tx(async () => {
      await como(superadmins[0]);
      const q = (s: string) => rechazo("select public.agente_consulta($1)", [s]);
      expect(await q("select * from public.siigo_facturas")).toMatch(/permission denied/);
      expect(await q("select * from public.turno_pin")).toMatch(/permission denied/);
      expect(await q("select * from public.audit_log")).toMatch(/permission denied/);
      expect(await q("select * from public.registro_solicitud")).toMatch(/permission denied/);
      expect(await q("select * from public.agente_mensaje")).toMatch(/permission denied/);
      expect(await q("select email from auth.users")).toMatch(/permission denied/);
      // Y nadie con sesión entra directo a las vistas.
      expect(await rechazo("select count(*) from agente.clientes")).toMatch(/permission denied for schema agente/);
    });
  });

  it("la transacción queda en solo lectura y no se puede deshacer eso", async () => {
    await tx(async () => {
      await como(superadmins[0]);
      const q = (s: string) => rechazo("select public.agente_consulta($1)", [s]);
      expect(await q("select net.http_get('https://example.com') as x")).toMatch(/read-only/);
      // Postgres lo dice de dos maneras según el punto en que lo ataje; las dos lo bloquean.
      expect(await q("select set_config('transaction_read_only', 'off', true) as x")).toMatch(/read-write mode/);
      expect(await q("select set_config('role', 'postgres', true) as x")).toMatch(/security-definer/);
    });
  });
});

describe("conversaciones guardadas", () => {
  it("cada superadministrador ve solo las suyas; recepción no ve ninguna", async () => {
    if (superadmins.length < 2) return;
    await tx(async () => {
      const [a, b] = superadmins;
      await client.query(
        "insert into public.agente_conversacion (perfil_id, titulo) values ($1, 'Prueba A'), ($2, 'Prueba B')", [a, b]);
      await client.query(
        "insert into public.agente_mensaje (conversacion_id, rol, contenido) select id, 'usuario', 'hola' from public.agente_conversacion where titulo in ('Prueba A', 'Prueba B')");
      await como(a);
      const suyas = await client.query("select titulo from public.agente_conversacion where titulo like 'Prueba _'");
      expect(suyas.rows.map((r) => r.titulo)).toEqual(["Prueba A"]);
      const mensajes = await client.query("select count(*)::int as n from public.agente_mensaje m join public.agente_conversacion c on c.id = m.conversacion_id where c.titulo like 'Prueba _'");
      expect(mensajes.rows[0].n).toBe(1);
      await client.query("reset role");
      if (recepcion) {
        await como(recepcion);
        const nada = await client.query("select count(*)::int as n from public.agente_conversacion");
        expect(nada.rows[0].n).toBe(0);
      }
    });
  });

  it("nadie con sesión las escribe: solo el servidor", async () => {
    await tx(async () => {
      await como(superadmins[0]);
      expect(await rechazo("insert into public.agente_conversacion (perfil_id) values ($1)", [superadmins[0]]))
        .toMatch(/permission denied/);
      expect(await rechazo("delete from public.agente_mensaje")).toMatch(/permission denied/);
    });
  });
});

describe("resúmenes nuevos", () => {
  // Las cifras de dinero tienen que salir con la MISMA fórmula que el dashboard.
  it("ventas por producto suman lo mismo que el facturado por servicio", async () => {
    await tx(async () => {
      const r = await client.query(`
        with a as (select coalesce(servicio_id, -1) s, sum(facturado) m
                   from public.agente_productos_vendidos('2026-10-01', '2026-10-31') group by 1),
             b as (select coalesce(servicio_id, -1) s, monto m
                   from public.siigo_facturado_servicio('2026-10-01', '2026-10-31'))
        select count(*)::int as distintos from a full join b on a.s = b.s where a.m is distinct from b.m`);
      expect(r.rows[0].distintos).toBe(0);
    });
  });

  it("el ticket del periodo suma lo mismo que el facturado del dashboard", async () => {
    await tx(async () => {
      const r = await client.query(`
        select (select facturado from public.agente_ticket('2026-10-01', '2026-10-31')
                where mes = 'todo el periodo' and segmento = 'todas')::bigint as ticket,
               (select facturado from public.siigo_recaudo('2026-10-01', '2026-10-31'))::bigint as recaudo`);
      expect(r.rows[0].ticket).toBe(r.rows[0].recaudo);
    });
  });

  it("los demás resúmenes corren con la sesión del superadministrador", async () => {
    await tx(async () => {
      await como(superadmins[0]);
      for (const sql of [
        "select * from public.agente_clases_resumen('2026-10-01', '2026-10-31')",
        "select * from public.agente_asistencia_resumen('2026-10-01', '2026-10-31')",
        "select * from public.agente_paquetes_resumen()",
        "select * from public.agente_clientes_resumen('2026-10-01', '2026-10-31')",
        "select * from public.agente_cafeteria_pedidos('2026-10-01', '2026-10-31')",
        "select * from public.agente_compras_juntas('2026-10-01', '2026-10-31', 'producto', 5)",
      ]) {
        expect(await rechazo(sql)).toBeNull();
      }
      const ind = await client.query("select indicador from public.agente_clientes_resumen('2026-10-01', '2026-10-31')");
      expect(ind.rows.map((r) => r.indicador)).toContain("fichas_compraron_antes_y_no_ahora");
    });
  });

  it("anon no ejecuta ninguno", async () => {
    await tx(async () => {
      await client.query("set local role anon");
      expect(await rechazo("select * from public.agente_ticket('2026-10-01', '2026-10-31')")).toMatch(/permission denied/);
      expect(await rechazo("select public.agente_consulta('select 1')")).toMatch(/permission denied/);
    });
  });
});
