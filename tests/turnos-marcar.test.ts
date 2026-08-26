import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

/**
 * Pruebas de las dos puertas de marcación (celular y quiósco), de las
 * correcciones del superadministrador y de quién puede ver qué.
 *
 * Todo corre dentro de transacciones que se revierten, simulando la sesión de
 * cada persona con `set local role` + `request.jwt.claims`, igual que hace
 * PostgREST.
 *
 * ⚠️ No se cambia el rol de ningún perfil dentro de la prueba: `private.user_role()`
 * no ve ese cambio en la misma transacción (ya mordió antes en este proyecto).
 * Por eso se usan perfiles que YA tienen el rol que se quiere probar.
 */
const client = new pg.Client({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT) || 5432,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  ssl: { rejectUnauthorized: false },
});

let empleado: string; // recepción, será quien marca turno
let admin: string;    // superadministradora
let otro: string;     // profesor: ni marca turno ni corrige nada

beforeAll(async () => {
  await client.connect();
  const r = await client.query(
    `select p.id, u.email from public.profiles p join auth.users u on u.id = p.id
      where u.email in ($1, $2, $3)`,
    ["santivelz2004@gmail.com", "vena.digital.2207@gmail.com", "cristianjo12@gmail.com"],
  );
  empleado = r.rows.find((x) => x.email === "santivelz2004@gmail.com")?.id;
  admin = r.rows.find((x) => x.email === "vena.digital.2207@gmail.com")?.id;
  otro = r.rows.find((x) => x.email === "cristianjo12@gmail.com")?.id;
  expect(empleado && admin && otro, "faltan perfiles de prueba").toBeTruthy();
});

afterAll(async () => {
  await client.end();
});

async function enTransaccion<T>(fn: () => Promise<T>): Promise<T> {
  await client.query("begin");
  try {
    return await fn();
  } finally {
    await client.query("rollback");
  }
}

async function comoUsuario<T>(sub: string, fn: () => Promise<T>): Promise<T> {
  await client.query("set local role authenticated");
  await client.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub, role: "authenticated" }),
  ]);
  try {
    return await fn();
  } finally {
    await client.query("reset role");
  }
}

/**
 * Corre algo que se espera que FALLE y devuelve el mensaje de error.
 *
 * ⚠️ Va con savepoint a propósito. En Postgres, un error deja la transacción
 * ABORTADA y toda sentencia posterior responde "current transaction is aborted".
 * Sin esto, la primera prueba de rechazo tumbaba en cascada a las diez
 * siguientes, y los mensajes de fallo no tenían nada que ver con lo que se
 * estaba probando — parecía que el módulo entero estuviera roto.
 */
async function falla(sql: string, params: unknown[] = []): Promise<string> {
  await client.query("savepoint sp");
  try {
    await client.query(sql, params);
  } catch (e) {
    await client.query("rollback to savepoint sp");
    return (e as Error).message;
  }
  await client.query("release savepoint sp");
  throw new Error(`Se esperaba un error y la sentencia pasó: ${sql}`);
}

/** Prende el interruptor de "registra turnos" (como lo haría el superadministrador). */
async function habilitar(perfil: string, valor = true): Promise<void> {
  await client.query("update public.profiles set marca_turno = $2 where id = $1", [perfil, valor]);
}

const FOTO = "prueba/foto.jpg";

describe("marcar desde el celular", () => {
  it("la secuencia completa: entrada, almuerzo, regreso y salida", async () => {
    await enTransaccion(async () => {
      await habilitar(empleado);
      await comoUsuario(empleado, async () => {
        await client.query("select public.turno_marcar('entrada', $1)", [FOTO]);
        await client.query("select public.turno_marcar('pausa_inicio')");
        await client.query("select public.turno_marcar('pausa_fin')");
        await client.query("select public.turno_marcar('salida', $1)", [FOTO]);
      });

      const t = await client.query(
        `select t.origen, t.fin_el is not null as cerrado,
                (select count(*)::int from public.turno_pausa p where p.turno_id = t.id) as pausas
           from public.turno t where t.perfil_id = $1`,
        [empleado],
      );
      expect(t.rows).toHaveLength(1);
      expect(t.rows[0].origen).toBe("app");
      expect(t.rows[0].cerrado).toBe(true);
      expect(t.rows[0].pausas).toBe(1);
    });
  });

  it("la hora la pone el servidor y va sin segundos", async () => {
    await enTransaccion(async () => {
      await habilitar(empleado);
      await comoUsuario(empleado, () =>
        client.query("select public.turno_marcar('entrada', $1)", [FOTO]),
      );
      const r = await client.query(
        `select extract(second from inicio_el)::int as seg,
                abs(extract(epoch from (now() - inicio_el))) < 90 as reciente
           from public.turno where perfil_id = $1`,
        [empleado],
      );
      expect(r.rows[0].seg).toBe(0);
      expect(r.rows[0].reciente).toBe(true);
    });
  });

  it("sin el interruptor prendido, no puede marcar", async () => {
    await enTransaccion(async () => {
      await habilitar(empleado, false);
      await comoUsuario(empleado, async () => {
        expect(await falla("select public.turno_marcar('entrada', $1)", [FOTO]))
          .toMatch(/no registra turnos/i);
      });
    });
  });

  it("no deja abrir dos turnos a la vez", async () => {
    await enTransaccion(async () => {
      await habilitar(empleado);
      await comoUsuario(empleado, async () => {
        await client.query("select public.turno_marcar('entrada', $1)", [FOTO]);
        expect(await falla("select public.turno_marcar('entrada', $1)", [FOTO]))
          .toMatch(/turno abierto/i);
      });
    });
  });

  it("no deja cerrar el turno con el almuerzo abierto", async () => {
    // Es la regla que evita el dato imposible de arreglar después: contar la
    // pausa en cero le paga el almuerzo, y estirarla hasta el final del turno le
    // quita horas que sí trabajó.
    await enTransaccion(async () => {
      await habilitar(empleado);
      await comoUsuario(empleado, async () => {
        await client.query("select public.turno_marcar('entrada', $1)", [FOTO]);
        await client.query("select public.turno_marcar('pausa_inicio')");
        expect(await falla("select public.turno_marcar('salida', $1)", [FOTO]))
          .toMatch(/regreso del almuerzo/i);
      });
    });
  });

  it("exige la foto en la entrada y en la salida", async () => {
    await enTransaccion(async () => {
      await habilitar(empleado);
      await comoUsuario(empleado, async () => {
        expect(await falla("select public.turno_marcar('entrada')")).toMatch(/foto de entrada/i);
        await client.query("select public.turno_marcar('entrada', $1)", [FOTO]);
        expect(await falla("select public.turno_marcar('salida')")).toMatch(/foto de salida/i);
      });
    });
  });
});

describe("marcar desde el quiósco", () => {
  it("con el PIN correcto marca y queda registrado como quiósco", async () => {
    await enTransaccion(async () => {
      await habilitar(empleado);
      await comoUsuario(admin, async () => {
        await client.query("select public.turno_pin_asignar($1, '4821')", [empleado]);
        const r = await client.query(
          "select * from public.quiosco_marcar($1, '4821', 'entrada', $2)",
          [empleado, FOTO],
        );
        expect(r.rows[0].ok).toBe(true);
        expect(r.rows[0].turno_id).toBeTruthy();
      });
      const t = await client.query("select origen from public.turno where perfil_id = $1", [empleado]);
      expect(t.rows[0].origen).toBe("quiosco");
    });
  });

  it("el PIN equivocado no marca, y a los 5 intentos bloquea", async () => {
    // ⚠️ El bloqueo solo funciona porque la función DEVUELVE un estado en vez de
    // lanzar excepción: una excepción revertiría la transacción y con ella el
    // contador de intentos, así que nunca llegaría a cinco.
    await enTransaccion(async () => {
      await habilitar(empleado);
      await comoUsuario(admin, async () => {
        await client.query("select public.turno_pin_asignar($1, '4821')", [empleado]);
        for (let i = 0; i < 5; i++) {
          const r = await client.query(
            "select * from public.quiosco_marcar($1, '0000', 'entrada', $2)",
            [empleado, FOTO],
          );
          expect(r.rows[0].ok).toBe(false);
        }
        // Ya bloqueado: ni siquiera el PIN bueno pasa.
        const bueno = await client.query(
          "select * from public.quiosco_marcar($1, '4821', 'entrada', $2)",
          [empleado, FOTO],
        );
        expect(bueno.rows[0].ok).toBe(false);
        expect(bueno.rows[0].mensaje).toMatch(/bloqueado/i);
      });
      const t = await client.query(
        "select count(*)::int as n from public.turno where perfil_id = $1",
        [empleado],
      );
      expect(t.rows[0].n).toBe(0);
    });
  });

  it("un profesor no puede usar la pantalla del quiósco", async () => {
    await enTransaccion(async () => {
      await habilitar(empleado);
      await comoUsuario(otro, async () => {
        expect(
          await falla("select * from public.quiosco_marcar($1, '4821', 'entrada', $2)", [empleado, FOTO]),
        ).toMatch(/equipo de recepción/i);
      });
    });
  });

  it("el PIN son 4 dígitos y solo lo asigna el superadministrador", async () => {
    await enTransaccion(async () => {
      await comoUsuario(admin, async () => {
        expect(await falla("select public.turno_pin_asignar($1, '12')", [empleado]))
          .toMatch(/4 dígitos/i);
      });
      await comoUsuario(otro, async () => {
        expect(await falla("select public.turno_pin_asignar($1, '1234')", [empleado]))
          .toMatch(/superadministrador/i);
      });
    });
  });
});

describe("correcciones del superadministrador", () => {
  it("ajusta las horas de un turno y lo deja en la bitácora", async () => {
    await enTransaccion(async () => {
      const t = await client.query(
        `insert into public.turno (perfil_id, inicio_el, fin_el)
         values ($1, '2027-09-06 07:00-05', '2027-09-06 15:00-05') returning id`,
        [empleado],
      );
      const id = t.rows[0].id;

      await comoUsuario(admin, () =>
        client.query(
          "select public.turno_ajustar($1, '2027-09-06 07:00-05', '2027-09-06 17:00-05', $2)",
          [id, "se le olvidó marcar la salida"],
        ),
      );

      const r = await client.query(
        `select t.ajuste_motivo, t.ajustado_por,
                (select count(*)::int from public.audit_log a
                  where a.action = 'turno.ajustar' and a.entity_id = t.id::text) as bitacora
           from public.turno t where t.id = $1`,
        [id],
      );
      expect(r.rows[0].ajuste_motivo).toMatch(/olvidó/);
      expect(r.rows[0].ajustado_por).toBe(admin);
      expect(r.rows[0].bitacora).toBe(1);
    });
  });

  it("exige motivo y no deja dejar el almuerzo por fuera del turno", async () => {
    await enTransaccion(async () => {
      const t = await client.query(
        `insert into public.turno (perfil_id, inicio_el, fin_el)
         values ($1, '2027-09-06 07:00-05', '2027-09-06 15:00-05') returning id`,
        [empleado],
      );
      const id = t.rows[0].id;
      await client.query(
        `insert into public.turno_pausa (turno_id, inicio_el, fin_el)
         values ($1, '2027-09-06 12:00-05', '2027-09-06 13:00-05')`,
        [id],
      );

      await comoUsuario(admin, async () => {
        expect(
          await falla("select public.turno_ajustar($1, '2027-09-06 07:00-05', '2027-09-06 15:00-05', '')", [id]),
        ).toMatch(/motivo/i);
        // Recortar el turno a las 11 dejaría el almuerzo (12–13) por fuera.
        expect(
          await falla("select public.turno_ajustar($1, '2027-09-06 07:00-05', '2027-09-06 11:00-05', $2)", [id, "prueba"]),
        ).toMatch(/almuerzo quedaría por fuera/i);
      });
    });
  });

  it("un profesor no puede corregir turnos ajenos", async () => {
    await enTransaccion(async () => {
      const t = await client.query(
        `insert into public.turno (perfil_id, inicio_el, fin_el)
         values ($1, '2027-09-06 07:00-05', '2027-09-06 15:00-05') returning id`,
        [empleado],
      );
      await comoUsuario(otro, async () => {
        expect(
          await falla("select public.turno_ajustar($1, '2027-09-06 07:00-05', '2027-09-06 16:00-05', $2)", [
            t.rows[0].id, "me subo el sueldo",
          ]),
        ).toMatch(/superadministrador/i);
      });
    });
  });

  it("crear un turno a mano exige entrada y salida", async () => {
    await enTransaccion(async () => {
      await comoUsuario(admin, async () => {
        expect(
          await falla("select public.turno_crear_manual($1, '2027-09-06 07:00-05', null, $2)", [empleado, "prueba"]),
        ).toMatch(/entrada y salida/i);
        const r = await client.query(
          "select public.turno_crear_manual($1, '2027-09-06 07:00-05', '2027-09-06 14:00-05', $2) as id",
          [empleado, "no marcó, se fue la luz"],
        );
        expect(r.rows[0].id).toBeTruthy();
      });
      const t = await client.query("select origen from public.turno where perfil_id = $1", [empleado]);
      expect(t.rows[0].origen).toBe("ajuste");
    });
  });
});

describe("quién ve los turnos", () => {
  it("el empleado NO ve su propio registro de horas", async () => {
    // Decisión de Laura: el registro es solo del superadministrador. Se cierra en
    // la base y no solo en la pantalla, porque esconder el menú no cierra la API.
    await enTransaccion(async () => {
      await client.query(
        `insert into public.turno (perfil_id, inicio_el, fin_el) values
           ($1, '2027-09-06 07:00-05', '2027-09-06 15:00-05'),
           ($1, '2027-09-07 07:00-05', '2027-09-07 15:00-05'),
           ($2, '2027-09-06 07:00-05', '2027-09-06 15:00-05')`,
        [empleado, otro],
      );
      const mios = await comoUsuario(empleado, () =>
        client.query("select perfil_id from public.turno where inicio_el >= '2027-01-01'"),
      );
      expect(mios.rows).toHaveLength(0);

      // Y el cálculo de horas tampoco le dice nada: es SECURITY INVOKER, así que
      // la misma política lo alcanza sin necesidad de un guardia aparte.
      const horas = await comoUsuario(empleado, () =>
        client.query(
          "select coalesce(sum(total), 0)::int as n from public.turnos_horas('2027-09-06', '2027-09-12')",
        ),
      );
      expect(horas.rows[0].n).toBe(0);
    });
  });

  it("pero sí ve su turno abierto, que es lo que la pantalla necesita", async () => {
    // Sin esto no se puede saber si toca ofrecer "Iniciar" o "Cerrar", ni si hay
    // un almuerzo sin regreso.
    await enTransaccion(async () => {
      await habilitar(empleado);
      await comoUsuario(empleado, async () => {
        await client.query("select public.turno_marcar('entrada', $1)", [FOTO]);
        const abierto = await client.query(
          "select inicio_el from public.turno where fin_el is null",
        );
        expect(abierto.rows).toHaveLength(1);

        await client.query("select public.turno_marcar('pausa_inicio')");
        const pausa = await client.query(
          "select id from public.turno_pausa where fin_el is null",
        );
        expect(pausa.rows).toHaveLength(1);

        // Al cerrarlo deja de verlo: el turno pasa a ser solo del reporte.
        await client.query("select public.turno_marcar('pausa_fin')");
        await client.query("select public.turno_marcar('salida', $1)", [FOTO]);
        const despues = await client.query("select id from public.turno");
        expect(despues.rows).toHaveLength(0);
      });
    });
  });

  it("el superadministrador los ve todos", async () => {
    await enTransaccion(async () => {
      await client.query(
        `insert into public.turno (perfil_id, inicio_el, fin_el) values
           ($1, '2027-09-06 07:00-05', '2027-09-06 15:00-05'),
           ($2, '2027-09-06 07:00-05', '2027-09-06 15:00-05')`,
        [empleado, otro],
      );
      const todos = await comoUsuario(admin, () =>
        client.query("select perfil_id from public.turno where inicio_el >= '2027-01-01'"),
      );
      expect(todos.rows).toHaveLength(2);
    });
  });

  it("nadie puede escribir la tabla directamente: la hora solo la pone el servidor", async () => {
    await enTransaccion(async () => {
      await habilitar(empleado);
      await comoUsuario(empleado, async () => {
        expect(
          await falla(
            `insert into public.turno (perfil_id, inicio_el, fin_el)
             values ($1, '2027-09-06 05:00-05', '2027-09-06 22:00-05')`,
            [empleado],
          ),
        ).toMatch(/permission denied|denegado|row-level security/i);
      });
    });
  });

  it("nadie puede leer los PIN, ni el superadministrador", async () => {
    await enTransaccion(async () => {
      await comoUsuario(admin, async () => {
        expect(await falla("select * from public.turno_pin"))
          .toMatch(/permission denied|denegado/i);
      });
    });
  });
});

describe("el PIN desde la ficha del empleado", () => {
  it("dice si hay PIN sin revelarlo nunca", async () => {
    await enTransaccion(async () => {
      await comoUsuario(admin, async () => {
        const antes = await client.query("select public.turno_pin_estado($1) as hay", [empleado]);
        expect(antes.rows[0].hay).toBe(false);

        await client.query("select public.turno_pin_asignar($1, '4821')", [empleado]);
        const despues = await client.query("select public.turno_pin_estado($1) as hay", [empleado]);
        expect(despues.rows[0].hay).toBe(true);
      });
    });
  });

  it("quitar el PIN no toca nada más: sigue pudiendo marcar desde el celular", async () => {
    await enTransaccion(async () => {
      await habilitar(empleado);
      await comoUsuario(admin, async () => {
        await client.query("select public.turno_pin_asignar($1, '4821')", [empleado]);
        await client.query("select public.turno_pin_borrar($1)", [empleado]);
        const r = await client.query("select public.turno_pin_estado($1) as hay", [empleado]);
        expect(r.rows[0].hay).toBe(false);
      });
      // El interruptor sigue prendido y la puerta del celular funciona igual.
      await comoUsuario(empleado, async () => {
        await client.query("select public.turno_marcar('entrada', $1)", [FOTO]);
      });
      const t = await client.query("select count(*)::int as n from public.turno where perfil_id = $1", [empleado]);
      expect(t.rows[0].n).toBe(1);
    });
  });

  it("solo el superadministrador puede preguntar o quitar el PIN", async () => {
    await enTransaccion(async () => {
      await comoUsuario(otro, async () => {
        expect(await falla("select public.turno_pin_estado($1)", [empleado]))
          .toMatch(/superadministrador/i);
        expect(await falla("select public.turno_pin_borrar($1)", [empleado]))
          .toMatch(/superadministrador/i);
      });
    });
  });

  it("apagar el interruptor deja a la persona sin poder marcar", async () => {
    await enTransaccion(async () => {
      await habilitar(empleado);
      await comoUsuario(empleado, () =>
        client.query("select public.turno_marcar('entrada', $1)", [FOTO]),
      );
      // El superadministrador lo apaga desde la ficha.
      await comoUsuario(admin, () =>
        client.query("update public.profiles set marca_turno = false where id = $1", [empleado]),
      );
      await comoUsuario(empleado, async () => {
        expect(await falla("select public.turno_marcar('salida', $1)", [FOTO]))
          .toMatch(/no registra turnos/i);
      });
    });
  });
});

describe("verificar el PIN antes de abrir la cámara", () => {
  it("el PIN bueno pasa y NO marca nada todavía", async () => {
    await enTransaccion(async () => {
      await habilitar(empleado);
      await comoUsuario(admin, async () => {
        await client.query("select public.turno_pin_asignar($1, '4821')", [empleado]);
        const r = await client.query(
          "select * from public.quiosco_pin_verificar($1, '4821')",
          [empleado],
        );
        expect(r.rows[0].ok).toBe(true);
      });
      const t = await client.query(
        "select count(*)::int as n from public.turno where perfil_id = $1",
        [empleado],
      );
      expect(t.rows[0].n).toBe(0);
    });
  });

  it("dice cuántos intentos quedan, y bloquea al quinto", async () => {
    await enTransaccion(async () => {
      await habilitar(empleado);
      await comoUsuario(admin, async () => {
        await client.query("select public.turno_pin_asignar($1, '4821')", [empleado]);
        const mensajes: string[] = [];
        for (let i = 0; i < 5; i++) {
          const r = await client.query(
            "select * from public.quiosco_pin_verificar($1, '0000')",
            [empleado],
          );
          expect(r.rows[0].ok).toBe(false);
          mensajes.push(r.rows[0].mensaje);
        }
        expect(mensajes[0]).toMatch(/quedan 4 intentos/i);
        expect(mensajes[3]).toMatch(/queda 1 intento\./i);
        expect(mensajes[4]).toMatch(/bloqueado/i);

        // Y bloqueado ya no pasa ni el bueno.
        const bueno = await client.query(
          "select * from public.quiosco_pin_verificar($1, '4821')",
          [empleado],
        );
        expect(bueno.rows[0].ok).toBe(false);
        expect(bueno.rows[0].mensaje).toMatch(/bloqueado/i);
      });
    });
  });

  it("marcar vuelve a validar el PIN: saltarse la verificación no sirve", async () => {
    // La pantalla verifica primero para fallar temprano, pero la marcación NO
    // confía en eso: es la misma comprobación, una sola implementación.
    await enTransaccion(async () => {
      await habilitar(empleado);
      await comoUsuario(admin, async () => {
        await client.query("select public.turno_pin_asignar($1, '4821')", [empleado]);
        const r = await client.query(
          "select * from public.quiosco_marcar($1, '0000', 'entrada', $2)",
          [empleado, FOTO],
        );
        expect(r.rows[0].ok).toBe(false);
      });
      const t = await client.query(
        "select count(*)::int as n from public.turno where perfil_id = $1",
        [empleado],
      );
      expect(t.rows[0].n).toBe(0);
    });
  });

  it("un profesor no puede verificar PINes", async () => {
    await enTransaccion(async () => {
      await habilitar(empleado);
      await comoUsuario(otro, async () => {
        expect(await falla("select * from public.quiosco_pin_verificar($1, '4821')", [empleado]))
          .toMatch(/equipo de recepción/i);
      });
    });
  });
});

describe("borrar las fotos al mes", () => {
  /** Inserta un turno con fotos, fechado hace `dias` días. */
  async function turnoViejo(dias: number, cerrado = true): Promise<number> {
    const r = await client.query(
      `insert into public.turno (perfil_id, inicio_el, fin_el, foto_inicio_path, foto_fin_path)
       values ($1,
               now() - make_interval(days => $2::int),
               case when $3 then now() - make_interval(days => $2::int) + interval '7 hours' end,
               'vieja/' || $2::text || '-e.jpg',
               case when $3 then 'vieja/' || $2::text || '-s.jpg' end)
       returning id`,
      [empleado, dias, cerrado],
    );
    return r.rows[0].id;
  }

  it("lista las de más de un mes y deja quietas las recientes", async () => {
    await enTransaccion(async () => {
      await turnoViejo(40);
      await turnoViejo(10);
      const r = await client.query("select ruta from public.turno_fotos_vencidas(30) order by ruta");
      const rutas = r.rows.map((x) => x.ruta);
      expect(rutas).toEqual(["vieja/40-e.jpg", "vieja/40-s.jpg"]);
    });
  });

  it("un turno cerrado se mide por la SALIDA, no por la entrada", async () => {
    // Con 30 días justos de plazo, un turno que entró hace 30 días y 5 horas
    // pero salió hace 30 días menos 2 horas todavía NO cumple el mes.
    await enTransaccion(async () => {
      await client.query(
        `insert into public.turno (perfil_id, inicio_el, fin_el, foto_inicio_path, foto_fin_path)
         values ($1, now() - interval '30 days 5 hours', now() - interval '29 days 22 hours',
                 'borde/e.jpg', 'borde/s.jpg')`,
        [empleado],
      );
      const r = await client.query("select count(*)::int as n from public.turno_fotos_vencidas(30)");
      expect(r.rows[0].n).toBe(0);
    });
  });

  it("un turno que quedó abierto también pierde su foto al mes", async () => {
    // La política es la política. Y un turno sin cerrar de hace 40 días lleva
    // saliendo en rojo en el reporte desde el primer día.
    await enTransaccion(async () => {
      await turnoViejo(40, false);
      const r = await client.query("select ruta from public.turno_fotos_vencidas(30)");
      expect(r.rows.map((x) => x.ruta)).toEqual(["vieja/40-e.jpg"]);
    });
  });

  it("olvidar limpia las rutas y CONSERVA el turno", async () => {
    await enTransaccion(async () => {
      const id = await turnoViejo(40);
      const n = await client.query(
        "select public.turno_fotos_olvidar(array['vieja/40-e.jpg','vieja/40-s.jpg']) as n",
      );
      expect(n.rows[0].n).toBe(2);

      const t = await client.query(
        "select foto_inicio_path, foto_fin_path, inicio_el is not null as vive from public.turno where id = $1",
        [id],
      );
      expect(t.rows[0].foto_inicio_path).toBeNull();
      expect(t.rows[0].foto_fin_path).toBeNull();
      expect(t.rows[0].vive).toBe(true);
    });
  });

  it("el plazo por defecto es de 45 días, y es el que manda", async () => {
    // La tarea llama a la función SIN parámetro justamente para que este número
    // sea el único. Si alguien lo cambia en la base, esta prueba lo cuenta.
    await enTransaccion(async () => {
      await turnoViejo(40); // dentro de los 45: todavía no vence
      await turnoViejo(50); // pasado: sí vence
      const r = await client.query("select ruta from public.turno_fotos_vencidas() order by ruta");
      expect(r.rows.map((x) => x.ruta)).toEqual(["vieja/50-e.jpg", "vieja/50-s.jpg"]);
    });
  });

  it("no deja poner un plazo absurdo", async () => {
    await enTransaccion(async () => {
      expect(await falla("select * from public.turno_fotos_vencidas(0)")).toMatch(/al menos un día/i);
    });
  });

  it("un profesor no puede listarlas ni olvidarlas", async () => {
    await enTransaccion(async () => {
      await comoUsuario(otro, async () => {
        expect(await falla("select * from public.turno_fotos_vencidas(30)"))
          .toMatch(/tarea de limpieza o el superadministrador/i);
        expect(await falla("select public.turno_fotos_olvidar(array['x'])"))
          .toMatch(/tarea de limpieza o el superadministrador/i);
      });
    });
  });
});
