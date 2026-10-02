import { describe, it, expect } from "vitest";
import { normalizarNombre, soloDigitos, desempatarPorNombre, type Candidato } from "../src/lib/registro/match";

/**
 * La búsqueda del niño en el registro público (plan §4.5). Lógica pura con los
 * casos REALES que ya mordieron en este proyecto: hermanos con el mismo documento
 * (Matías/Elena Restrepo), nombres con tildes y mayúsculas ("SIMON VÉLEZ" /
 * "Simon Velez"), y nombres compuestos.
 */
const c = (id: number, nombres: string, apellidos: string, doc = "1017204187"): Candidato => ({
  miembro_id: id, cliente_id: 430, nombres, apellidos, documento: doc, fecha_nacimiento: null, es_titular: false,
});

describe("normalizarNombre", () => {
  it("quita tildes, mayúsculas, signos y dobles espacios", () => {
    expect(normalizarNombre("  SIMÓN  Vélez-Gómez ")).toBe("simon velez gomez");
    expect(normalizarNombre("Ñeque")).toBe(normalizarNombre("neque")); // la ñ cae a n en los dos lados
    expect(normalizarNombre(null)).toBe("");
  });
});

describe("soloDigitos", () => {
  it("deja solo dígitos y rechaza lo demasiado corto", () => {
    expect(soloDigitos("1.037.607-268")).toBe("1037607268");
    expect(soloDigitos("12")).toBeNull();
    expect(soloDigitos(undefined)).toBeNull();
  });
});

describe("desempatarPorNombre (hermanos con el mismo documento)", () => {
  const matias = c(584, "Matías", "Restrepo");
  const elena = c(428, "Elena", "Restrepo");

  it("con el nombre completo escoge al correcto", () => {
    expect(desempatarPorNombre([matias, elena], "matias", "restrepo").map((x) => x.miembro_id)).toEqual([584]);
    expect(desempatarPorNombre([matias, elena], "ELENA", "RESTREPO").map((x) => x.miembro_id)).toEqual([428]);
  });

  it("acepta el nombre escrito distinto ('SIMON VÉLEZ' / 'Simon Andres Velez Gomez')", () => {
    const simon = c(1, "Simon Andres", "Velez Gomez", "1");
    expect(desempatarPorNombre([simon, elena], "SIMÓN", "VÉLEZ").map((x) => x.miembro_id)).toEqual([1]);
  });

  it("si nadie casa, devuelve vacío (el que llama lo trata como ambiguo)", () => {
    expect(desempatarPorNombre([matias, elena], "Pedro", "Pérez")).toEqual([]);
  });

  it("si dos fichas tienen el MISMO nombre y documento (duplicado), quedan las dos → ambiguo", () => {
    const dup = c(999, "Matías", "Restrepo");
    expect(desempatarPorNombre([matias, dup, elena], "Matías", "Restrepo")).toHaveLength(2);
  });

  it("sin nombre no desempata: devuelve los candidatos tal cual", () => {
    expect(desempatarPorNombre([matias, elena], "", "Restrepo")).toHaveLength(2);
  });
});

/**
 * `buscarMiembro` con un cliente de Supabase FALSO (sin base): lo que importa aquí es la
 * decisión, no la consulta. Caso real que motivó la regla (Laura, 2-oct-2026): el papá
 * escribe SU cédula en el campo del niño; antes se aceptaba y D1 le sobrescribía el nombre.
 */
import { buscarMiembro } from "../src/lib/registro/match";

function clienteFalso(filas: Array<Partial<Candidato> & { id: number }>) {
  const q = {
    select: () => q, eq: () => q,
    limit: async () => ({ data: filas.map((f) => ({ cliente_id: 1, nombres: "", apellidos: "", documento: null, fecha_nacimiento: null, es_titular: false, ...f })) }),
  };
  return { from: () => q } as never;
}

describe("buscarMiembro · documento de alguien con otro nombre", () => {
  it("el papá pone su propia cédula: el documento es de Carlos, pero el nombre es Luciano → documento_ajeno, nunca único", async () => {
    const r = await buscarMiembro(clienteFalso([{ id: 10, nombres: "Carlos", apellidos: "Gómez", documento: "71234556" }]), {
      documento: "71234556", nombres: "Luciano", apellidos: "Gómez", fechaNacimiento: "2017-06-02",
    });
    expect(r.tipo).toBe("documento_ajeno");
  });

  it("documento único y nombre parecido → único (como siempre)", async () => {
    const r = await buscarMiembro(clienteFalso([{ id: 10, nombres: "Luciano Andrés", apellidos: "Gómez Pérez", documento: "1023456789" }]), {
      documento: "1023456789", nombres: "luciano", apellidos: "gomez",
    });
    expect(r.tipo).toBe("unico");
    if (r.tipo === "unico") expect(r.por).toBe("documento");
  });

  it("hermanos con el mismo documento: el nombre escoge → único por documento+nombre", async () => {
    const r = await buscarMiembro(clienteFalso([{ id: 584, nombres: "Matías", apellidos: "Restrepo", documento: "1017204187" }, { id: 428, nombres: "Elena", apellidos: "Restrepo", documento: "1017204187" }]), {
      documento: "1017204187", nombres: "Elena", apellidos: "Restrepo",
    });
    expect(r.tipo).toBe("unico");
    if (r.tipo === "unico") expect(r.miembro.miembro_id).toBe(428);
  });
});

import { buscarAdultoPorCorreo } from "../src/lib/registro/match";
/** Cliente falso con dos tablas: `clientes` (por correo) y `cliente_miembros` (el titular). */
function fichasFalsas(clientes: Array<{ id: number; nombres: string; apellidos: string }>, titulares: Record<number, number>) {
  let tabla = "";
  let clienteId = 0;
  const q: Record<string, unknown> = {};
  q.select = () => q; q.ilike = () => q;
  q.eq = (col: string, v: unknown) => { if (col === "cliente_id") clienteId = Number(v); return q; };
  q.limit = () => Object.assign(Promise.resolve({ data: tabla === "clientes" ? clientes : [] }), {
    maybeSingle: async () => ({ data: titulares[clienteId] ? { id: titulares[clienteId] } : null }),
  });
  return { from: (t: string) => { tabla = t; return q; } } as never;
}

describe("buscarAdultoPorCorreo (adulto cuya ficha no tiene cédula; Laura, 2-oct-2026)", () => {
  it("correo en una ficha de adulto Y nombre coincide → el titular de esa ficha (se actualiza)", async () => {
    const r = await buscarAdultoPorCorreo(fichasFalsas([{ id: 77, nombres: "Ana María", apellidos: "Pérez Gómez" }], { 77: 900 }), {
      email: "Ana@Correo.com", nombres: "ana", apellidos: "perez",
    });
    expect(r).toEqual({ cliente_id: 77, miembro_id: 900 });
  });

  it("correo sí pero el nombre no (la pareja comparte correo) → null (ficha nueva, nunca 'hermano')", async () => {
    const r = await buscarAdultoPorCorreo(fichasFalsas([{ id: 77, nombres: "Ana María", apellidos: "Pérez Gómez" }], { 77: 900 }), {
      email: "ana@correo.com", nombres: "Carlos", apellidos: "Ruiz",
    });
    expect(r).toBeNull();
  });

  it("sin correo, o con el correo en ninguna ficha → null", async () => {
    expect(await buscarAdultoPorCorreo(fichasFalsas([], {}), { email: "", nombres: "Ana", apellidos: "Pérez" })).toBeNull();
    expect(await buscarAdultoPorCorreo(fichasFalsas([], {}), { email: "x@y.com", nombres: "Ana", apellidos: "Pérez" })).toBeNull();
  });
});
