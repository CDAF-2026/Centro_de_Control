import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

/**
 * El cierre sale del PLANEADOR, no de filas generadas por adelantado.
 *
 * Estas pruebas van contra Postgres de verdad y todo lo que escriben se revierte.
 * Se prueban las tres reglas que el club dictó y que en pantalla se ven iguales
 * si se rompen:
 *   · en festivo la academia NO dicta → la clase ni se propone
 *   · en receso SÍ se propone, pero marcada, porque algunos niños van
 *   · `vigente_desde` es el piso: sin él la cola iría hacia atrás sin fin
 *
 * ⚠️ Y la que de verdad importa: el PROFESOR no puede insertar en `clases`
 * (`clases_write` no lo cubre) y es justo quien más cierra. Por eso abrir la
 * clase va por un RPC SECURITY DEFINER. Si alguien lo cambiara por un insert
 * directo, la RLS lo rechazaría SIN LANZAR ERROR y la clase no se crearía en
 * silencio — el fallo que este proyecto ya pagó con el saldo de los paquetes.
 */
const client = new pg.Client({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT) || 5432,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  ssl: { rejectUnauthorized: false },
});

beforeAll(async () => { await client.connect(); });
afterAll(async () => { await client.end(); });

/** Todo dentro de una transacción que SIEMPRE se revierte. */
async function enTransaccion<T>(fn: () => Promise<T>): Promise<T> {
  await client.query("begin");
  try { return await fn(); } finally { await client.query("rollback"); }
}

async function comoProfesor(id: string) {
  await client.query("set local role authenticated");
  await client.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: id, role: "authenticated" }),
  ]);
}

const q = async (sql: string, params: unknown[] = []) => (await client.query(sql, params)).rows;

describe("academia_pendientes · qué debió dictarse", () => {
  it("no propone clases antes de `vigente_desde`", async () => {
    await enTransaccion(async () => {
      await q("update public.clase_semanal set vigente_desde = '2026-10-01'");
      const antes = await q(
        "select count(*)::int n from public.academia_pendientes('2026-09-01','2026-09-30')",
      );
      expect(antes[0].n).toBe(0);
      const despues = await q(
        "select count(*)::int n from public.academia_pendientes('2026-10-01','2026-10-07')",
      );
      expect(despues[0].n).toBeGreaterThan(0);
    });
  });

  it("se salta los festivos: la academia no dicta", async () => {
    await enTransaccion(async () => {
      await q("update public.clase_semanal set vigente_desde = '2026-01-01'");
      // 12-oct-2026 es lunes y es festivo (Día de la Raza).
      const festivo = await q("select count(*)::int n from public.festivo where fecha = '2026-10-12'");
      expect(festivo[0].n).toBe(1);
      const ese = await q(
        "select count(*)::int n from public.academia_pendientes('2026-10-12','2026-10-12')",
      );
      expect(ese[0].n).toBe(0);
      // El lunes siguiente, que no es festivo, sí trae clases.
      const otro = await q(
        "select count(*)::int n from public.academia_pendientes('2026-10-19','2026-10-19')",
      );
      expect(otro[0].n).toBeGreaterThan(0);
    });
  });

  it("en receso SÍ propone, pero marcado (algunos niños van)", async () => {
    await enTransaccion(async () => {
      await q("update public.clase_semanal set vigente_desde = '2026-01-01'");
      const sinReceso = await q(
        "select count(*)::int n from public.academia_pendientes('2026-10-19','2026-10-19') where en_receso",
      );
      expect(sinReceso[0].n).toBe(0);

      await q(
        "insert into public.academia_receso (desde, hasta, motivo) values ('2026-10-19','2026-10-23','Prueba')",
      );
      const conReceso = await q(
        "select count(*)::int total, count(*) filter (where en_receso)::int marcadas from public.academia_pendientes('2026-10-19','2026-10-19')",
      );
      // Esconderlas dejaría sin registrar a los que sí fueron: se proponen igual.
      expect(conReceso[0].total).toBeGreaterThan(0);
      expect(conReceso[0].marcadas).toBe(conReceso[0].total);
    });
  });

  it("una clase marcada «no se dictó» deja de proponerse, igual que una cerrada", async () => {
    // Es la salida para lo que el calendario no previó: un receso sin cargar,
    // un profesor enfermo, lluvia. Sin ella la clase quedaría pendiente para
    // siempre y la cola dejaría de significar algo.
    await enTransaccion(async () => {
      await q("update public.clase_semanal set vigente_desde = '2026-01-01'");
      const [cs] = await q("select id, dia_semana from public.clase_semanal where activa order by id limit 1");
      const [{ fecha }] = await q(
        `select d::date fecha from generate_series('2026-10-05'::date,'2026-10-11'::date,'1 day') d
          where extract(dow from d) = $1 limit 1`,
        [cs.dia_semana],
      );
      await q(
        `insert into public.clases (tipo, clase_semanal_id, fecha, precio, estado, motivo_cancelacion)
         values ('academia', $1, $2, 0, 'cancelada', 'Semana de receso')`,
        [cs.id, fecha],
      );
      const [{ n }] = await q(
        "select count(*)::int n from public.academia_pendientes($1,$1) where clase_id = $2",
        [fecha, cs.id],
      );
      expect(n).toBe(0);
    });
  });

  it("lo ya cerrado deja de proponerse", async () => {
    await enTransaccion(async () => {
      await q("update public.clase_semanal set vigente_desde = '2026-01-01'");
      const [cs] = await q(
        "select id, dia_semana from public.clase_semanal where activa order by id limit 1",
      );
      // Un lunes cualquiera que case con el día de esa clase.
      const [{ fecha }] = await q(
        `select d::date fecha from generate_series('2026-10-05'::date,'2026-10-11'::date,'1 day') d
          where extract(dow from d) = $1 limit 1`,
        [cs.dia_semana],
      );
      const antes = await q(
        "select count(*)::int n from public.academia_pendientes($1,$1) where clase_id = $2",
        [fecha, cs.id],
      );
      expect(antes[0].n).toBe(1);

      await q(
        `insert into public.clases (tipo, clase_semanal_id, fecha, precio, estado)
         values ('academia', $1, $2, 0, 'programada')`,
        [cs.id, fecha],
      );
      const despues = await q(
        "select count(*)::int n from public.academia_pendientes($1,$1) where clase_id = $2",
        [fecha, cs.id],
      );
      expect(despues[0].n).toBe(0);
    });
  });
});

describe("clase_abrir_del_planeador · la clase nace al cerrarla", () => {
  it("el profesor abre la SUYA, aunque no pueda insertar en `clases`", async () => {
    await enTransaccion(async () => {
      await q("update public.clase_semanal set vigente_desde = '2026-01-01'");
      const [cs] = await q(
        `select cs.id, cs.profesor_id, cs.dia_semana from public.clase_semanal cs
         join public.profiles p on p.id = cs.profesor_id
         where cs.activa and p.role = 'profesor' order by cs.id limit 1`,
      );
      const [{ fecha }] = await q(
        `select d::date fecha from generate_series(current_date - 7, current_date, '1 day') d
          where extract(dow from d) = $1 limit 1`,
        [cs.dia_semana],
      );

      await comoProfesor(cs.profesor_id);

      // Primero: el insert directo lo rechaza la RLS. Esto es lo que justifica
      // que el RPC sea SECURITY DEFINER.
      await q("savepoint sp");
      await expect(
        q("insert into public.clases (tipo, fecha, precio, estado) values ('academia', $1, 0, 'programada')", [fecha]),
      ).rejects.toThrow(/row-level security/i);
      await q("rollback to savepoint sp");

      // Y por el RPC sí puede.
      // `bigint` llega como string desde `pg`: se compara como número.
      const [r] = await q("select public.clase_abrir_del_planeador($1,$2)::int id", [cs.id, fecha]);
      expect(r.id).toBeGreaterThan(0);

      // Idempotente: dos clics no crean dos clases.
      const [otra] = await q("select public.clase_abrir_del_planeador($1,$2)::int id", [cs.id, fecha]);
      expect(otra.id).toBe(r.id);
    });
  });

  it("un profesor NO puede abrir la clase de otro", async () => {
    await enTransaccion(async () => {
      await q("update public.clase_semanal set vigente_desde = '2026-01-01'");
      const profes = await q(
        `select distinct cs.profesor_id from public.clase_semanal cs
         join public.profiles p on p.id = cs.profesor_id where p.role = 'profesor' limit 2`,
      );
      const [ajena] = await q(
        "select id, dia_semana from public.clase_semanal where profesor_id = $1 limit 1",
        [profes[1].profesor_id],
      );
      const [{ fecha }] = await q(
        `select d::date fecha from generate_series(current_date - 7, current_date, '1 day') d
          where extract(dow from d) = $1 limit 1`,
        [ajena.dia_semana],
      );
      await comoProfesor(profes[0].profesor_id);
      await expect(
        q("select public.clase_abrir_del_planeador($1,$2)", [ajena.id, fecha]),
      ).rejects.toThrow(/No tienes permiso/);
    });
  });

  it("rechaza el día que no es, el futuro y el festivo", async () => {
    await enTransaccion(async () => {
      await q("update public.clase_semanal set vigente_desde = '2026-01-01'");
      const [cs] = await q("select id, dia_semana from public.clase_semanal where activa order by id limit 1");

      // ⚠️ Cada rechazo va con su SAVEPOINT: en Postgres un error deja la
      // transacción abortada y todo lo que siga responde "current transaction is
      // aborted", con un mensaje que no tiene nada que ver con lo que se prueba.
      const [otroDia] = await q(
        `select d::date fecha from generate_series(current_date - 7, current_date, '1 day') d
          where extract(dow from d) <> $1 limit 1`,
        [cs.dia_semana],
      );
      await q("savepoint sp1");
      await expect(
        q("select public.clase_abrir_del_planeador($1,$2)", [cs.id, otroDia.fecha]),
      ).rejects.toThrow(/no se dicta ese día/i);
      await q("rollback to savepoint sp1");

      // Futuro, pero EN SU DÍA: si no, saltaría antes el guardia del día y la
      // prueba pasaría sin haber probado nada.
      const [futuro] = await q(
        `select d::date fecha from generate_series(current_date + 1, current_date + 8, '1 day') d
          where extract(dow from d) = $1 limit 1`,
        [cs.dia_semana],
      );
      await q("savepoint sp2");
      await expect(
        q("select public.clase_abrir_del_planeador($1,$2)", [cs.id, futuro.fecha]),
      ).rejects.toThrow(/todavía no ha pasado/i);
      await q("rollback to savepoint sp2");
    });
  });

  it("rechaza un festivo, con una clase de ESE día de la semana", async () => {
    await enTransaccion(async () => {
      await q("update public.clase_semanal set vigente_desde = '2026-01-01'");
      // Un festivo ya pasado, y una clase que se dicte ese mismo día de la semana.
      const [f] = await q(
        `select fecha, extract(dow from fecha)::int dow from public.festivo
          where fecha < current_date and fecha >= '2026-01-01'
            and extract(dow from fecha)::int in (select dia_semana from public.clase_semanal where activa)
          order by fecha desc limit 1`,
      );
      expect(f).toBeTruthy();
      const [cs] = await q(
        "select id from public.clase_semanal where activa and dia_semana = $1 limit 1",
        [f.dow],
      );
      await expect(
        q("select public.clase_abrir_del_planeador($1,$2)", [cs.id, f.fecha]),
      ).rejects.toThrow(/festivo/i);
    });
  });
});
