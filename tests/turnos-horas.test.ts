import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

/**
 * Pruebas del cálculo de horas del módulo de turnos.
 *
 * Se prueba contra la base REAL, con datos inventados dentro de transacciones
 * que se revierten. Es a propósito: el cálculo vive en SQL (`turnos_horas`), así
 * que una copia en TypeScript para poder probarlo sería una segunda
 * implementación de la misma regla — justo lo que en este proyecto ya salió mal
 * dos veces. Aquí se prueba el código que de verdad corre.
 *
 * Las fechas de prueba son de 2027 para que no se crucen nunca con turnos
 * reales, y se usa el desfase `-05` explícito porque Colombia no tiene horario
 * de verano: el offset es constante todo el año.
 *
 * Recordatorio de las reglas (acordadas con Laura el 25-ago-2026):
 *   · Jornada 7 h/día · 42 h/semana (lunes a domingo)
 *   · Diurna 6:00–18:59 · Nocturna 19:00–5:59
 *   · Extra si pasa de 7 h al día, de 42 a la semana, o si es después de las
 *     9 p.m. (o antes de las 6 a.m.), que es fuera de la operación del club
 *   · Domingos y festivos llevan recargo dominical
 */
const client = new pg.Client({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT) || 5432,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  ssl: { rejectUnauthorized: false },
});

/** Empleado de prueba (existe en la base; sus turnos de prueba se revierten). */
let empleado: string;
/** Superadministradora, para las funciones que solo ella puede llamar. */
let admin: string;
/** Alguien que NO es superadministrador, para probar que lo rechaza. */
let noAdmin: string;

beforeAll(async () => {
  await client.connect();
  const r = await client.query(
    `select p.id, p.role::text as role, u.email
       from public.profiles p join auth.users u on u.id = p.id
      where u.email in ($1, $2, $3)`,
    ["santivelz2004@gmail.com", "vena.digital.2207@gmail.com", "cristianjo12@gmail.com"],
  );
  empleado = r.rows.find((x) => x.email === "santivelz2004@gmail.com")?.id;
  admin = r.rows.find((x) => x.email === "vena.digital.2207@gmail.com")?.id;
  noAdmin = r.rows.find((x) => x.email === "cristianjo12@gmail.com")?.id;
  expect(empleado, "falta el empleado de prueba").toBeTruthy();
  expect(admin, "falta la superadministradora").toBeTruthy();
  expect(noAdmin, "falta el perfil no-admin").toBeTruthy();
});

afterAll(async () => {
  await client.end();
});

/** Corre `fn` dentro de una transacción que SIEMPRE se revierte. */
async function enTransaccion<T>(fn: () => Promise<T>): Promise<T> {
  await client.query("begin");
  try {
    return await fn();
  } finally {
    await client.query("rollback");
  }
}

/** Inserta un turno cerrado. Horas en texto local de Bogotá: "2027-09-06 07:00". */
async function turno(inicio: string, fin: string | null, perfil = empleado): Promise<number> {
  const r = await client.query(
    `insert into public.turno (perfil_id, inicio_el, fin_el, foto_inicio_path, foto_fin_path)
     values ($1, ($2 || '-05')::timestamptz, case when $3::text is null then null else ($3 || '-05')::timestamptz end,
             'prueba/entrada.jpg', case when $3::text is null then null else 'prueba/salida.jpg' end)
     returning id`,
    [perfil, inicio, fin],
  );
  return r.rows[0].id;
}

/** Marca el almuerzo dentro de un turno. */
async function pausa(turnoId: number, inicio: string, fin: string): Promise<void> {
  await client.query(
    `insert into public.turno_pausa (turno_id, inicio_el, fin_el)
     values ($1, ($2 || '-05')::timestamptz, ($3 || '-05')::timestamptz)`,
    [turnoId, inicio, fin],
  );
}

type Horas = {
  diurnas: number;
  nocturnas: number;
  extraDiurnas: number;
  extraNocturnas: number;
  domDiurnas: number;
  domNocturnas: number;
  domExtraDiurnas: number;
  domExtraNocturnas: number;
  total: number;
};

const CERO: Horas = {
  diurnas: 0, nocturnas: 0, extraDiurnas: 0, extraNocturnas: 0,
  domDiurnas: 0, domNocturnas: 0, domExtraDiurnas: 0, domExtraNocturnas: 0, total: 0,
};

/** Suma el periodo completo y lo devuelve en HORAS (los minutos entran exactos). */
async function horas(desde: string, hasta: string, perfil = empleado): Promise<Horas> {
  const r = await client.query(
    "select * from public.turnos_horas($1::date, $2::date, $3::uuid)",
    [desde, hasta, perfil],
  );
  const acc = { ...CERO };
  for (const f of r.rows) {
    acc.diurnas += f.diurnas;
    acc.nocturnas += f.nocturnas;
    acc.extraDiurnas += f.extra_diurnas;
    acc.extraNocturnas += f.extra_nocturnas;
    acc.domDiurnas += f.dom_diurnas;
    acc.domNocturnas += f.dom_nocturnas;
    acc.domExtraDiurnas += f.dom_extra_diurnas;
    acc.domExtraNocturnas += f.dom_extra_nocturnas;
    acc.total += f.total;
  }
  for (const k of Object.keys(acc) as (keyof Horas)[]) acc[k] = acc[k] / 60;
  return acc;
}

// Semana de prueba: lunes 6 a domingo 12 de septiembre de 2027 (sin festivos).
const LUN = "2027-09-06";
const SAB = "2027-09-11";
const DOM = "2027-09-12";

describe("turnos_horas · jornada normal", () => {
  it("turno de mañana con almuerzo: 7 h diurnas y ninguna extra", async () => {
    await enTransaccion(async () => {
      const t = await turno(`${LUN} 07:00`, `${LUN} 15:00`);
      await pausa(t, `${LUN} 12:00`, `${LUN} 13:00`);
      expect(await horas(LUN, LUN)).toEqual({ ...CERO, diurnas: 7, total: 7 });
    });
  });

  it("turno de tarde que cruza las 7 p.m.: 5 diurnas + 2 nocturnas, sin extras", async () => {
    // A las 9 p.m. lleva exactamente sus 7 horas: el corte de las 9 y el tope de
    // 7 h dicen lo mismo, así que no debe aparecer ni un minuto extra.
    await enTransaccion(async () => {
      const t = await turno(`${LUN} 13:00`, `${LUN} 21:00`);
      await pausa(t, `${LUN} 16:00`, `${LUN} 17:00`);
      expect(await horas(LUN, LUN)).toEqual({ ...CERO, diurnas: 5, nocturnas: 2, total: 7 });
    });
  });

  it("cuenta al minuto exacto, sin redondear", async () => {
    await enTransaccion(async () => {
      await turno(`${LUN} 07:00`, `${LUN} 07:37`);
      const h = await horas(LUN, LUN);
      expect(h.total).toBeCloseTo(37 / 60, 10);
      expect(h.diurnas).toBeCloseTo(37 / 60, 10);
    });
  });

  it("la franja diurna arranca a las 6 a.m., como dice la ley", async () => {
    await enTransaccion(async () => {
      // 5:30 a 6:30: media hora antes de las 6 (nocturna y, por estar fuera de la
      // operación del club, extra) y media hora ya diurna.
      await turno(`${LUN} 05:30`, `${LUN} 06:30`);
      const h = await horas(LUN, LUN);
      expect(h.diurnas).toBeCloseTo(0.5, 10);
      expect(h.extraNocturnas).toBeCloseTo(0.5, 10);
      expect(h.total).toBe(1);
    });
  });
});

describe("turnos_horas · horas extra", () => {
  it("quedarse hasta las 11 p.m. después de la jornada completa", async () => {
    await enTransaccion(async () => {
      const t = await turno(`${LUN} 13:00`, `${LUN} 23:00`);
      await pausa(t, `${LUN} 16:00`, `${LUN} 17:00`);
      // 9 h trabajadas: 5 diurnas + 2 nocturnas ordinarias (19–21) + 2 extra
      // nocturnas (21–23).
      expect(await horas(LUN, LUN)).toEqual({
        ...CERO, diurnas: 5, nocturnas: 2, extraNocturnas: 2, total: 9,
      });
    });
  });

  it("la regla de las 9 p.m. aplica aunque no se hayan cumplido las 7 h del día", async () => {
    // Este es el ÚNICO caso en que el corte de las 9 p.m. agrega plata: entró
    // tarde por un evento, trabajó 6 h (menos que su jornada) y aun así lo que
    // pasa de las 9 se paga como extra.
    await enTransaccion(async () => {
      await turno(`${LUN} 17:00`, `${LUN} 23:00`);
      expect(await horas(LUN, LUN)).toEqual({
        ...CERO, diurnas: 2, nocturnas: 2, extraNocturnas: 2, total: 6,
      });
    });
  });

  it("turno de 12 horas (Carlos): 7 ordinarias y 4 extra", async () => {
    await enTransaccion(async () => {
      const t = await turno(`${LUN} 09:00`, `${LUN} 21:00`);
      await pausa(t, `${LUN} 13:00`, `${LUN} 14:00`);
      // 11 h trabajadas. Las primeras 7 son ordinarias diurnas (termina a las
      // 5 p.m.); de 5 a 7 p.m. extra diurnas; de 7 a 9 p.m. extra nocturnas.
      expect(await horas(LUN, LUN)).toEqual({
        ...CERO, diurnas: 7, extraDiurnas: 2, extraNocturnas: 2, total: 11,
      });
    });
  });

  it("pasadas las 42 h de la semana, todo lo demás es extra", async () => {
    await enTransaccion(async () => {
      // Lunes a sábado, 7 h diarias = 42 h justas, sin una sola extra.
      for (let d = 6; d <= 11; d++) {
        const dia = `2027-09-${String(d).padStart(2, "0")}`;
        const t = await turno(`${dia} 07:00`, `${dia} 15:00`);
        await pausa(t, `${dia} 12:00`, `${dia} 13:00`);
      }
      expect(await horas(LUN, SAB)).toEqual({ ...CERO, diurnas: 42, total: 42 });

      // El domingo ya no queda cupo: sus 4 h entran completas como dominical extra.
      await turno(`${DOM} 08:00`, `${DOM} 12:00`);
      const semana = await horas(LUN, DOM);
      expect(semana.domExtraDiurnas).toBe(4);
      expect(semana.domDiurnas).toBe(0);
      expect(semana.total).toBe(46);
    });
  });
});

describe("turnos_horas · domingos y festivos", () => {
  it("el ejemplo de Laura: llega el domingo con 38 h y hace 7", async () => {
    await enTransaccion(async () => {
      // Lunes a viernes: 38 h (cuatro días de 8 h y uno de 6). Se reparten sin
      // pasar de 7 h diarias para que NO generen extras por el tope del día.
      const previas: [string, string][] = [
        [`${LUN} 07:00`, `${LUN} 14:00`],                 // lun 7 h
        ["2027-09-07 07:00", "2027-09-07 14:00"],         // mar 7 h
        ["2027-09-08 07:00", "2027-09-08 14:00"],         // mié 7 h
        ["2027-09-09 07:00", "2027-09-09 14:00"],         // jue 7 h
        ["2027-09-10 07:00", "2027-09-10 14:00"],         // vie 7 h
        ["2027-09-11 08:00", "2027-09-11 11:00"],         // sáb 3 h → 38 h
      ];
      for (const [i, f] of previas) await turno(i, f);
      expect((await horas(LUN, SAB)).total).toBe(38);

      // Domingo: 7 h. Las 4 primeras completan las 42 → dominicales ordinarias;
      // las 3 restantes → dominicales extra. Es exactamente lo que dictó Laura.
      await turno(`${DOM} 08:00`, `${DOM} 15:00`);
      const dom = await horas(DOM, DOM);
      expect(dom.domDiurnas).toBe(4);
      expect(dom.domExtraDiurnas).toBe(3);
      expect(dom.total).toBe(7);
    });
  });

  it("un festivo se paga como domingo", async () => {
    await enTransaccion(async () => {
      // 18-oct-2027 es lunes festivo (Día de la Raza corrido por la Ley Emiliani).
      const festivo = "2027-10-18";
      const t = await turno(`${festivo} 07:00`, `${festivo} 15:00`);
      await pausa(t, `${festivo} 12:00`, `${festivo} 13:00`);
      expect(await horas(festivo, festivo)).toEqual({ ...CERO, domDiurnas: 7, total: 7 });
    });
  });

  it("el domingo por la noche acumula los dos recargos", async () => {
    await enTransaccion(async () => {
      await turno(`${DOM} 18:00`, `${DOM} 20:00`);
      expect(await horas(DOM, DOM)).toEqual({
        ...CERO, domDiurnas: 1, domNocturnas: 1, total: 2,
      });
    });
  });
});

describe("turnos_horas · casos límite", () => {
  it("un turno que cruza la medianoche se parte en los dos días", async () => {
    await enTransaccion(async () => {
      await turno(`${LUN} 20:00`, "2027-09-07 02:00");
      const r = await client.query(
        "select dia::text, total from public.turnos_horas($1::date, $2::date, $3::uuid) order by dia",
        [LUN, "2027-09-07", empleado],
      );
      expect(r.rows.map((f) => [f.dia, f.total])).toEqual([
        [LUN, 240],            // 20:00–24:00
        ["2027-09-07", 120],   // 00:00–02:00
      ]);
      const h = await horas(LUN, "2027-09-07");
      expect(h.nocturnas).toBe(1);        // 20:00–21:00, dentro de la operación
      expect(h.extraNocturnas).toBe(5);   // 21:00–02:00, fuera de ella
    });
  });

  it("un turno abierto no aporta horas (no se inventa la salida)", async () => {
    await enTransaccion(async () => {
      await turno(`${LUN} 07:00`, null);
      expect((await horas(LUN, LUN)).total).toBe(0);
      const r = await client.query(
        "select minutos, fin_el from public.turnos_listar($1::date, $2::date, $3::uuid)",
        [LUN, LUN, empleado],
      );
      expect(r.rows).toHaveLength(1);
      expect(r.rows[0].minutos).toBeNull();
      expect(r.rows[0].fin_el).toBeNull();
    });
  });

  it("pedir medio periodo no reinicia el contador de las 42 h", async () => {
    // El riesgo que cubre esta prueba: si la función contara solo desde
    // `p_desde`, las horas del viernes saldrían como ordinarias cuando la semana
    // ya venía pasada de 42 desde el jueves.
    await enTransaccion(async () => {
      for (let d = 6; d <= 10; d++) {
        const dia = `2027-09-${String(d).padStart(2, "0")}`;
        await turno(`${dia} 07:00`, `${dia} 18:00`); // 11 h/día, sin almuerzo
      }
      // Al pedir SOLO el viernes: ese día arranca con 44 h encima (4 × 11), así
      // que sus 11 h están todas por encima del tope semanal.
      const vie = await horas("2027-09-10", "2027-09-10");
      expect(vie.diurnas).toBe(0);
      expect(vie.extraDiurnas).toBe(11);
    });
  });

  it("el almuerzo se descuenta de la franja en que ocurre", async () => {
    await enTransaccion(async () => {
      // Almuerzo de 7 a 8 p.m.: tiene que salir de las NOCTURNAS. Quedan
      // 14:00–19:00 (5 h diurnas) y 20:00–21:00 (1 h nocturna).
      await turno(`${LUN} 14:00`, `${LUN} 21:00`).then((t) =>
        pausa(t, `${LUN} 19:00`, `${LUN} 20:00`),
      );
      expect(await horas(LUN, LUN)).toEqual({
        ...CERO, diurnas: 5, nocturnas: 1, total: 6,
      });
    });
  });

  it("turnos_listar descuenta el almuerzo de los minutos del turno", async () => {
    await enTransaccion(async () => {
      const t = await turno(`${LUN} 07:00`, `${LUN} 15:00`);
      await pausa(t, `${LUN} 12:00`, `${LUN} 13:00`);
      const r = await client.query(
        "select minutos, minutos_pausa, n_pausas, pausa_abierta from public.turnos_listar($1::date, $2::date, $3::uuid)",
        [LUN, LUN, empleado],
      );
      expect(r.rows[0]).toMatchObject({
        minutos: 420, minutos_pausa: 60, n_pausas: 1, pausa_abierta: false,
      });
    });
  });
});
