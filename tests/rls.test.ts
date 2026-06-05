import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

/**
 * Tests de Row Level Security sobre `profiles`.
 * Conecta como `postgres` y simula cada rol con `set local role` +
 * `request.jwt.claims` (igual que PostgREST), envuelto en transacciones que
 * se revierten para no dejar estado.
 */
const client = new pg.Client({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT) || 5432,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  ssl: { rejectUnauthorized: false },
});

let adminId: string | undefined;

beforeAll(async () => {
  await client.connect();
  const r = await client.query("select id from auth.users where email = $1", [
    "vena.digital.2207@gmail.com",
  ]);
  adminId = r.rows[0]?.id;
});

afterAll(async () => {
  await client.end();
});

async function asRole<T>(
  role: "authenticated" | "anon",
  sub: string | null,
  fn: () => Promise<T>,
): Promise<T> {
  await client.query("begin");
  try {
    await client.query(`set local role ${role}`);
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify(sub ? { sub, role } : { role }),
    ]);
    return await fn();
  } finally {
    await client.query("rollback");
  }
}

async function countProfiles(): Promise<number> {
  const r = await client.query("select count(*)::int as n from public.profiles");
  return r.rows[0].n;
}

describe("RLS · profiles", () => {
  it("anon no puede leer perfiles", async () => {
    const n = await asRole("anon", null, countProfiles);
    expect(n).toBe(0);
  });

  it("un autenticado desconocido no ve perfiles de otros", async () => {
    const n = await asRole(
      "authenticated",
      "00000000-0000-0000-0000-000000000000",
      countProfiles,
    );
    expect(n).toBe(0);
  });

  it("el superadministrador ve todos los perfiles", async () => {
    expect(adminId).toBeTruthy();
    const n = await asRole("authenticated", adminId!, countProfiles);
    expect(n).toBeGreaterThanOrEqual(1);
  });
});
