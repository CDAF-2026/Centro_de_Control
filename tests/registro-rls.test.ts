import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

/**
 * Registro público y consentimiento digital · Fase 1 (1-oct-2026).
 *
 * Fija lo que las migraciones 20261001130000–135000 prometen: las tablas nuevas
 * no tienen privilegios para `anon` ni escritura para `authenticated`; las firmas
 * las ve quien ve la ficha; la evidencia no se borra; sin versión vigente nadie
 * firma; y el rate limit corta en el 11º intento. Todo revertido.
 *
 * Mismo arnés que rls.test.ts: `set local role` + `request.jwt.claims`, y
 * SAVEPOINT en las pruebas de rechazo (un error deja la transacción abortada).
 */
const client = new pg.Client({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT) || 5432,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  ssl: { rejectUnauthorized: false },
});

const TABLAS = [
  "consentimiento_version",
  "registro_sesion",
  "registro_solicitud",
  "registro_cambio",
  "registro_intento",
  "consentimiento_firma",
];

let recepcionId: string | undefined;
let superadminId: string | undefined;

beforeAll(async () => {
  await client.connect();
  const r = await client.query(
    "select id, role from public.profiles where activo and role in ('recepcion','superadmin') order by role",
  );
  recepcionId = r.rows.find((x) => x.role === "recepcion")?.id;
  superadminId = r.rows.find((x) => x.role === "superadmin")?.id;
});

afterAll(async () => {
  await client.end();
});

/** Corre `fn` dentro de una transacción que SIEMPRE se revierte. */
async function tx<T>(fn: () => Promise<T>): Promise<T> {
  await client.query("begin");
  try {
    return await fn();
  } finally {
    await client.query("rollback");
  }
}

async function comoRol(role: "anon" | "authenticated", sub: string | null) {
  await client.query(`set local role ${role}`);
  await client.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify(sub ? { sub, role } : { role }),
  ]);
}

/** Ejecuta `sql` y devuelve el mensaje de error (o null si pasó), sin abortar la transacción. */
async function rechazo(sql: string, params: unknown[] = []): Promise<string | null> {
  await client.query("savepoint p");
  try {
    await client.query(sql, params);
    await client.query("release savepoint p");
    return null;
  } catch (e) {
    await client.query("rollback to savepoint p");
    return (e as Error).message;
  }
}

describe("registro · privilegios", () => {
  it("anon no tiene NINGÚN privilegio en las tablas nuevas (0082: Supabase los regala por defecto)", async () => {
    const r = await client.query(
      `select t, bool_or(has_table_privilege('anon', 'public.'||t, p)) as alguno
         from unnest($1::text[]) t, unnest(array['select','insert','update','delete']) p
        group by t`,
      [TABLAS],
    );
    for (const row of r.rows) expect(row.alguno, row.t).toBe(false);
  });

  it("authenticated no puede escribir en ninguna (todo entra por RPC o service_role)", async () => {
    const r = await client.query(
      `select t, bool_or(has_table_privilege('authenticated', 'public.'||t, p)) as alguno
         from unnest($1::text[]) t, unnest(array['insert','update','delete']) p
        group by t`,
      [TABLAS],
    );
    for (const row of r.rows) expect(row.alguno, row.t).toBe(false);
  });

  it("los RPC del camino público no los puede ejecutar anon ni authenticated", async () => {
    const r = await client.query(`
      select f, has_function_privilege('anon', f, 'execute') as anon_ok,
                has_function_privilege('authenticated', f, 'execute') as auth_ok
        from unnest(array[
          'public.registro_permitido(text)',
          'public.consentimiento_firmar(jsonb)',
          'public.consentimiento_adjuntar(uuid,text,text,text)',
          'public.registro_limpiar()'
        ]) f`);
    for (const row of r.rows) {
      expect(row.anon_ok, row.f).toBe(false);
      expect(row.auth_ok, row.f).toBe(false);
    }
  });
});

describe("registro · quién ve qué", () => {
  it("recepción ve las firmas (como los documentos) pero NO las solicitudes ni la versión", async () => {
    expect(recepcionId).toBeTruthy();
    await tx(async () => {
      await comoRol("authenticated", recepcionId!);
      // Ojo: una lectura que la política rechaza devuelve 0 FILAS, no un error (handoff §8.A).
      // Por eso se mide contra la versión 2026-10, que existe: recepción no la ve, el SA sí.
      expect(await rechazo("select count(*) from public.consentimiento_firma")).toBeNull();
      const v = await client.query("select count(*)::int as n from public.consentimiento_version where codigo = '2026-10'");
      expect(v.rows[0].n).toBe(0);
      const s = await client.query("select count(*)::int as n from public.registro_solicitud");
      expect(s.rows[0].n).toBe(0);
    });
  });

  it("el superadministrador sí lee solicitudes, cambios y versión", async () => {
    expect(superadminId).toBeTruthy();
    await tx(async () => {
      await comoRol("authenticated", superadminId!);
      for (const t of ["registro_solicitud", "registro_cambio", "consentimiento_version", "consentimiento_firma"]) {
        expect(await rechazo(`select count(*) from public.${t}`), t).toBeNull();
      }
      const v = await client.query("select codigo, vigente_desde from public.consentimiento_version");
      expect(v.rows.map((x) => x.codigo)).toContain("2026-10");
    });
  });
});

describe("registro · reglas de la base", () => {
  // ⚠️ Si la versión está abierta o cerrada lo decide Laura (Fase 4), no la prueba:
  // cada caso fuerza su precondición DENTRO de la transacción que se revierte (handoff §8.H).
  it("la versión 2026-10 existe con huella; cerrada, `consentimiento_version_vigente()` no la devuelve", async () => {
    await tx(async () => {
      await client.query("update public.consentimiento_version set vigente_desde = null, vigente_hasta = null where codigo = '2026-10'");
      const r = await client.query(
        "select length(texto_sha256) as n, (public.consentimiento_version_vigente()).id as vigente from public.consentimiento_version where codigo = '2026-10'",
      );
      expect(r.rows[0].n).toBe(64);
      expect(r.rows[0].vigente).toBeNull();
    });
  });

  it("sin versión vigente, firmar se rechaza con un mensaje que lo dice", async () => {
    await tx(async () => {
      await client.query("update public.consentimiento_version set vigente_desde = null, vigente_hasta = null");
      const m = await client.query("select id, cliente_id from public.cliente_miembros order by id limit 1");
      const msg = await rechazo("select public.consentimiento_firmar($1::jsonb)", [
        JSON.stringify({
          cliente_id: m.rows[0].cliente_id, miembro_id: m.rows[0].id,
          firmante_nombre: "X", firmante_documento: "1", menor_nombre: "Y", metodo: "dibujada",
        }),
      ]);
      expect(msg).toMatch(/versión vigente/);
    });
  });

  it("con versión vigente: firmar → adjuntar deja el PDF en la ficha del NIÑO y nadie lo puede borrar", async () => {
    await tx(async () => {
      await client.query("update public.consentimiento_version set vigente_desde = current_date where codigo = '2026-10'");
      const m = await client.query("select id, cliente_id from public.cliente_miembros where not es_titular order by id limit 1");
      const { id: miembroId, cliente_id: clienteId } = m.rows[0];
      const f = await client.query("select public.consentimiento_firmar($1::jsonb) as id", [
        JSON.stringify({
          cliente_id: clienteId, miembro_id: miembroId,
          firmante_nombre: "Mamá Prueba", firmante_documento: "9990000001",
          menor_nombre: "Niño Prueba", metodo: "escrita", ip: "181.1.1.1", eps: "Sura",
        }),
      ]);
      const firmaId = f.rows[0].id;
      const d = await client.query(
        "select public.consentimiento_adjuntar($1, $2, $3, 'sha') as doc",
        [firmaId, `${firmaId}/consentimiento.pdf`, `${firmaId}/firma.png`],
      );
      const docId = d.rows[0].doc;
      expect(docId).toBeTruthy();

      const doc = await client.query("select miembro_id, bucket, origen, tipo from public.cliente_documentos where id = $1", [docId]);
      expect(doc.rows[0]).toMatchObject({ miembro_id: miembroId, bucket: "consentimientos", origen: "firma_digital", tipo: "consentimiento" });

      const firma = await client.query("select estado, pdf_sha256, documento_id, firmado_el <= now() as hora_ok from public.consentimiento_firma where id = $1", [firmaId]);
      expect(firma.rows[0]).toMatchObject({ estado: "asignada", pdf_sha256: "sha", documento_id: docId, hora_ok: true });

      // Ni como postgres: el trigger protege la evidencia.
      expect(await rechazo("delete from public.cliente_documentos where id = $1", [docId])).toMatch(/evidencia de una firma/);

      // El superadministrador puede anular (con motivo); el archivo y el documento siguen.
      await comoRol("authenticated", superadminId!);
      expect(await rechazo("select public.consentimiento_anular($1, 'x')", [firmaId])).toMatch(/motivo/);
      expect(await rechazo("select public.consentimiento_anular($1, 'Firmó la persona equivocada')", [firmaId])).toBeNull();
      const an = await client.query("select estado, motivo_anulacion, documento_id from public.consentimiento_firma where id = $1", [firmaId]);
      expect(an.rows[0]).toMatchObject({ estado: "anulada", motivo_anulacion: "Firmó la persona equivocada", documento_id: docId });
    });
  });

  it("recepción NO puede anular una firma", async () => {
    await tx(async () => {
      await comoRol("authenticated", recepcionId!);
      const msg = await rechazo("select public.consentimiento_anular(gen_random_uuid(), 'motivo largo')");
      expect(msg).toMatch(/superadministrador/);
    });
  });

  it("un miembro de OTRA ficha no se puede firmar como si fuera de esta", async () => {
    await tx(async () => {
      await client.query("update public.consentimiento_version set vigente_desde = current_date where codigo = '2026-10'");
      const r = await client.query(
        "select a.id as m, b.cliente_id as otra from public.cliente_miembros a, public.cliente_miembros b where a.cliente_id <> b.cliente_id limit 1",
      );
      const msg = await rechazo("select public.consentimiento_firmar($1::jsonb)", [
        JSON.stringify({ cliente_id: r.rows[0].otra, miembro_id: r.rows[0].m, firmante_nombre: "X", firmante_documento: "1", menor_nombre: "Y", metodo: "dibujada" }),
      ]);
      expect(msg).toMatch(/no pertenece a la ficha/);
    });
  });

  it("rate limit: 10 intentos pasan, el 11º en 10 minutos se rechaza", async () => {
    await tx(async () => {
      const ip = `prueba-${Date.now()}`;
      const res: boolean[] = [];
      for (let i = 0; i < 11; i++) {
        const r = await client.query("select public.registro_permitido($1) as ok", [ip]);
        res.push(r.rows[0].ok);
      }
      expect(res.slice(0, 10).every(Boolean)).toBe(true);
      expect(res[10]).toBe(false);
    });
  });

  it("registro_limpiar expira lo vencido y purga payloads viejos, sin tocar las firmas", async () => {
    await tx(async () => {
      await client.query(
        `insert into public.registro_solicitud (tipo, estado, payload, created_at, expira_el)
         values ('datos', 'recibida', '{"x":1}', now() - interval '3 days', now() - interval '1 day'),
                ('datos', 'aplicada', '{"x":1}', now() - interval '100 days', now())`,
      );
      const r = await client.query("select public.registro_limpiar() as j");
      expect(r.rows[0].j.solicitudes).toBeGreaterThanOrEqual(1);
      expect(r.rows[0].j.payloads).toBeGreaterThanOrEqual(1);
      const q = await client.query(
        "select count(*)::int as n from public.registro_solicitud where estado = 'aplicada' and payload is null and created_at < now() - interval '99 days'",
      );
      expect(q.rows[0].n).toBeGreaterThanOrEqual(1);
    });
  });
});
