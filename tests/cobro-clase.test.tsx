import React from "react";
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import pg from "pg";

/**
 * Cambiar cómo se cobra una clase ya registrada: paquete ↔ particular.
 *
 * Dos cosas distintas se prueban aquí, y las dos salieron del mismo caso real
 * (Karent Coronado, sep-2026):
 *
 *  1. **Que la pantalla DIGA de qué paquete sale la clase.** El subtítulo decía
 *     "Clase individual" en todas las que no son de academia, así que una de
 *     paquete y una particular se leían igual. La clase 424 ya estaba bien
 *     atada a su paquete y la pantalla la seguía mostrando como particular: el
 *     dato correcto y la pantalla mintiendo, que invita a "arreglar" lo que ya
 *     está bien.
 *
 *  2. **Que el saldo del paquete se mueva bien.** El descuento lo hace
 *     `cerrarClase` → `paquete_consumir`, así que una clase PROGRAMADA no ha
 *     consumido nada. Bajarle el saldo al moverla la cobraría DOS veces al
 *     cerrarla — exactamente lo que pasó al arreglar la clase 424 a mano.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push() {}, refresh() {}, replace() {} }),
}));
vi.mock("next/cache", () => ({ refresh: () => {}, revalidatePath: () => {}, revalidateTag: () => {} }));
// Las acciones viven en un archivo "use server" que arrastra media app; el
// formulario solo necesita que existan para llamarlas.
vi.mock("@/app/(app)/clases/actions", () => ({
  prepararCobro: async () => ({ paquetes: [] }),
  cambiarCobroClase: async () => ({}),
}));

// ─────────────────────────────────────────────────────────────
// 1) Lo que la pantalla dice
// ─────────────────────────────────────────────────────────────

describe("el modal dice cómo se cobra la clase", () => {
  const montar = async (props: Record<string, unknown>) => {
    const { CobroClaseForm } = await import("@/app/(app)/clases/cobro-clase-form");
    return renderToStaticMarkup(
      React.createElement(CobroClaseForm, {
        claseId: 424,
        modo: "paquete",
        paqueteLabel: "Paquete 8 clases Padel (2 personas) Joaquin · 8/8 disponibles",
        valor: 0,
        editable: true,
        aviso: null,
        cerrada: false,
        ...props,
      } as never),
    );
  };

  it("una clase de paquete se lee como de paquete, no como individual", async () => {
    const html = await montar({});
    expect(html).toContain("Paquete");
    expect(html).not.toContain("Particular</span>");
  });

  // El dato que faltaba: sin él no hay forma de creerle a la pantalla.
  it("dice de QUÉ paquete sale y cuánto le queda", async () => {
    const html = await montar({});
    expect(html).toContain("Paquete 8 clases Padel (2 personas) Joaquin");
    expect(html).toContain("8/8 disponibles");
  });

  it("una particular se lee como particular y no muestra paquete", async () => {
    const html = await montar({ modo: "particular", paqueteLabel: null, valor: 150000 });
    expect(html).toContain("Particular");
    expect(html).not.toContain("disponibles");
  });

  it("ofrece cambiarlo", async () => {
    expect(await montar({})).toContain("Cambiar");
  });

  it("sin permiso no ofrece cambiarlo, pero SÍ dice cómo se cobra", async () => {
    const html = await montar({ editable: false });
    expect(html).not.toContain("Cambiar");
    expect(html).toContain("Paquete 8 clases Padel (2 personas) Joaquin");
  });

  it("pasadas 24 h explica a quién pedírselo", async () => {
    const html = await montar({
      editable: false,
      aviso: "Pasaron más de 24 h: para cambiarlo, pídeselo al superadministrador.",
    });
    expect(html).toContain("superadministrador");
  });
});

// ─────────────────────────────────────────────────────────────
// 2) Cómo se mueve el saldo
// ─────────────────────────────────────────────────────────────

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

/** Corre dentro de una transacción que SIEMPRE se revierte. */
async function enTransaccion(fn: () => Promise<void>) {
  await client.query("begin");
  try {
    await fn();
  } finally {
    await client.query("rollback");
  }
}

const saldo = async (pq: number) => {
  const { rows } = await client.query(
    "select num_clases - clases_consumidas as saldo, clases_consumidas from paquetes_cliente where id = $1",
    [pq],
  );
  return rows[0] as { saldo: number; clases_consumidas: number };
};

describe("el saldo del paquete", () => {
  /**
   * ⚠️ Esta es LA invariante, y la que se rompió en producción: el descuento
   * ocurre al CERRAR. Una clase de paquete todavía programada tiene que dejar
   * el saldo intacto; si no, al cerrarla se cobra dos veces.
   */
  it("no se toca mientras la clase sigue programada", async () => {
    await enTransaccion(async () => {
      const { rows } = await client.query(
        `select pc.id, pc.num_clases - pc.clases_consumidas as saldo
           from paquetes_cliente pc
          where pc.estado = 'activo' and pc.num_clases > pc.clases_consumidas
          limit 1`,
      );
      const pq = rows[0];
      expect(pq, "hace falta al menos un paquete activo con saldo").toBeTruthy();

      // Se ata una clase PROGRAMADA al paquete, como hace `cambiarCobroClase`.
      const { rows: cl } = await client.query(
        `insert into clases (tipo, estado, fecha, deporte, precio, paquete_cliente_id,
                             cliente_id)
         select 'individual', 'programada', current_date, 'padel', 0, $1, pc.cliente_id
           from paquetes_cliente pc where pc.id = $1
         returning id`,
        [pq.id],
      );
      expect(cl[0].id).toBeTruthy();

      expect((await saldo(pq.id)).saldo).toBe(Number(pq.saldo));
    });
  });

  /**
   * ⚠️ El ORDEN de los tres pasos no es intercambiable: `paquete_consumir` lee
   * el `paquete_cliente_id` que la clase tiene EN ESE MOMENTO. Devolver el
   * saldo DESPUÉS de mover la clase se lo devolvería al paquete equivocado.
   */
  it("al mover una clase YA CERRADA de un paquete a otro, cada uno queda como debe", async () => {
    await enTransaccion(async () => {
      const { rows } = await client.query(
        `select pc.id, pc.cliente_id, pc.num_clases, pc.clases_consumidas
           from paquetes_cliente pc
          where pc.estado = 'activo' and pc.num_clases > pc.clases_consumidas
          limit 1`,
      );
      const a = rows[0];
      expect(a, "hace falta un paquete activo con saldo").toBeTruthy();

      // Un segundo paquete del MISMO cliente, clonado del primero.
      const { rows: bRows } = await client.query(
        `insert into paquetes_cliente (cliente_id, catalogo_id, num_clases, clases_consumidas, estado, inicia_el, vence_el)
         select cliente_id, catalogo_id, num_clases, 0, 'activo', current_date, current_date + 30
           from paquetes_cliente where id = $1
         returning id`,
        [a.id],
      );
      const b = bRows[0];

      // Clase CERRADA que hoy sale del paquete A y ya consumió su saldo.
      const { rows: cl } = await client.query(
        `insert into clases (tipo, estado, fecha, deporte, precio, paquete_cliente_id, cliente_id)
         values ('individual', 'realizada', current_date, 'padel', 0, $1, $2)
         returning id`,
        [a.id, a.cliente_id],
      );
      const claseId = cl[0].id;
      await client.query("update paquetes_cliente set clases_consumidas = clases_consumidas + 1 where id = $1", [a.id]);

      const aAntes = await saldo(a.id);
      const bAntes = await saldo(b.id);

      // Los tres pasos, EN ORDEN, tal como los hace `cambiarCobroClase`.
      await client.query("select paquete_consumir($1, -1)", [claseId]);          // 1) devolver a A
      await client.query("update clases set paquete_cliente_id = $1 where id = $2", [b.id, claseId]); // 2) mover
      await client.query("select paquete_consumir($1, 1)", [claseId]);           // 3) descontar de B

      expect((await saldo(a.id)).saldo, "A recupera su clase").toBe(aAntes.saldo + 1);
      expect((await saldo(b.id)).saldo, "B paga la clase").toBe(bAntes.saldo - 1);
    });
  });

  it("al pasar una clase cerrada de paquete a particular, el paquete recupera la clase", async () => {
    await enTransaccion(async () => {
      const { rows } = await client.query(
        `select id, cliente_id from paquetes_cliente
          where estado = 'activo' and num_clases > clases_consumidas limit 1`,
      );
      const pq = rows[0];
      const { rows: cl } = await client.query(
        `insert into clases (tipo, estado, fecha, deporte, precio, paquete_cliente_id, cliente_id)
         values ('individual', 'realizada', current_date, 'padel', 0, $1, $2)
         returning id`,
        [pq.id, pq.cliente_id],
      );
      const claseId = cl[0].id;
      await client.query("update paquetes_cliente set clases_consumidas = clases_consumidas + 1 where id = $1", [pq.id]);
      const antes = await saldo(pq.id);

      await client.query("select paquete_consumir($1, -1)", [claseId]);
      await client.query(
        "update clases set paquete_cliente_id = null, precio = 150000, valor_facturado = null where id = $1",
        [claseId],
      );

      expect((await saldo(pq.id)).saldo).toBe(antes.saldo + 1);
      const { rows: fin } = await client.query(
        "select paquete_cliente_id, precio, valor_facturado from clases where id = $1",
        [claseId],
      );
      expect(fin[0].paquete_cliente_id).toBeNull();
      expect(fin[0].precio).toBe(150000);
      // ⚠️ El override tiene que quedar limpio: la liquidación lee
      // `valor_facturado ?? …`, así que dejarlo puesto taparía el valor nuevo.
      expect(fin[0].valor_facturado).toBeNull();
    });
  });

  /**
   * El paquete de Karent, tal como quedó tras corregir el doble descuento:
   * una clase programada y CERO consumidas. Si esto vuelve a desviarse, algo
   * está descontando al registrar en vez de al cerrar.
   */
  it("hoy ningún paquete tiene más consumidas que clases realmente cerradas", async () => {
    const { rows } = await client.query(
      `select pc.id, pc.clases_consumidas,
              count(c.id) filter (where c.estado = 'realizada') as realizadas
         from paquetes_cliente pc
         left join clases c on c.paquete_cliente_id = pc.id
        where pc.estado <> 'anulado'
        group by pc.id, pc.clases_consumidas
       having pc.clases_consumidas <> count(c.id) filter (where c.estado = 'realizada')`,
    );
    expect(rows, `paquetes descuadrados: ${JSON.stringify(rows)}`).toHaveLength(0);
  });
});
