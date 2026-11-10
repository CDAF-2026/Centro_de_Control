import React from "react";
import { describe, it, expect, vi, beforeAll } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createClient as sbClient } from "@supabase/supabase-js";

/**
 * Prueba de regresión del bug del 25-ago-2026: `/academias/[id]` reventaba en
 * producción con "This page couldn't load".
 *
 * `riesgoDe` leía `totalClases` veinte líneas antes de que se declarara, y una
 * función la llamaba de inmediato → ReferenceError en CADA render.
 *
 * Lo grave no fue el descuido, fue que NADA lo detectaba:
 *   · `tsc` no lo ve, porque la lectura ocurre dentro de una función.
 *   · `npm run build` tampoco, porque las páginas son dinámicas y no se
 *     renderizan al compilar.
 *   · Pedir la URL con curl solo llega al redirect al login, así que el
 *     componente ni se ejecuta.
 *
 * Estas pruebas RENDERIZAN las páginas de verdad. No comprueban cifras (los
 * datos cambian todos los días): comprueban que la página se ejecute entera y
 * escupa su HTML. Cualquier error en tiempo de ejecución —orden de
 * declaración, un null sin guardar, un `.map` sobre undefined— las tumba.
 *
 * ⚠️ Se salta el guardia de sesión y usa service_role a propósito: aquí se
 * prueba el RENDER, no los permisos (de eso se encarga `rls.test.ts`). Efecto
 * secundario a tener en cuenta al leer el HTML: `staff_directorio` exige
 * `auth.uid()`, así que con service_role los nombres del staff salen vacíos y
 * todo aparece como "sin profesor". Eso es del arnés, no de la app.
 */

vi.mock("@/lib/auth", () => ({
  requireRole: async () => PERFIL,
  requireProfile: async () => PERFIL,
  getProfile: async () => PERFIL,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => admin(),
  createAdminClient: async () => admin(),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...r }: any) => React.createElement("a", { href: String(href), ...r }, children),
}));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NOT_FOUND"); },
  redirect: (u: string) => { throw new Error("REDIRECT " + u); },
  useRouter: () => ({ push() {}, refresh() {}, replace() {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

// El id se rellena con un superadministrador REAL antes de correr: `cerrarClase`
// escribe `clases.registrada_por`, que tiene FK a `profiles`, así que un uuid
// inventado revienta con un error de llave foránea que no tiene nada que ver con
// lo que se está probando. Se resuelve en tiempo de ejecución y no a mano para
// no fijar un id que el club puede mover.
const PERFIL = { id: "", role: "superadmin", nombre: "test", activo: true };
beforeAll(async () => {
  const { data } = await admin().from("profiles").select("id").eq("role", "superadmin").eq("activo", true).limit(1);
  if (!data?.[0]) throw new Error("No hay superadministrador: esta prueba lo necesita.");
  PERFIL.id = data[0].id;
});
const admin = () =>
  sbClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

const P = <T,>(o: T) => Promise.resolve(o);
const render = async (fn: any, props: any) => renderToStaticMarkup(await fn(props));
const texto = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
// Fecha LOCAL, la misma que usa `getDay()`. Con toISOString (UTC), después de las 7 p. m. en
// Bogotá la fecha ya es la de mañana y no casa con el día de la semana: las pruebas fallaban
// según la hora a la que se corrieran.
const fechaLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Un día PASADO en el que esa celda del planeador todavía no tiene clase.
 *
 * ⚠️ No se puede usar "ayer" a secas. El índice único `(clase_semanal_id, fecha)`
 * solo deja UNA clase por celda y día, y el club cierra las de verdad: si ayer
 * se dictó esa celda, el insert de la prueba se rechaza, `data` llega en null y
 * la prueba revienta con "Cannot read properties of null (reading 'id')", un
 * mensaje que no dice nada de la causa. Falla solo el día siguiente a que esa
 * celda se dicte (los martes para una clase de lunes), que es el peor tipo de
 * fallo. Ya mordió dos veces: 28-oct-2026 (la clase de colegio) y 10-nov-2026
 * (las otras dos que seguían con "ayer").
 *
 * Es la misma lección de siempre: una prueba no puede depender de un estado
 * que el club mueve por su cuenta.
 */
async function diaLibre(claseSemanalId: number): Promise<string> {
  const d = new Date();
  for (let i = 0; i < 60; i++) {
    d.setDate(d.getDate() - 1);
    const fecha = fechaLocal(d);
    const { count, error } = await admin()
      .from("clases")
      .select("id", { count: "exact", head: true })
      .eq("clase_semanal_id", claseSemanalId)
      .eq("fecha", fecha);
    if (error) throw new Error(`No se pudo buscar un día libre: ${error.message}`);
    if (!count) return fecha;
  }
  throw new Error(`La celda ${claseSemanalId} tiene clase en cada uno de los últimos 60 días.`);
}

/** Una clase y una academia que existan de verdad, para no fijar ids a mano. */
async function unaClase() {
  const { data } = await admin()
    .from("clase_semanal")
    .select("id, profesor_id")
    .eq("activa", true)
    .order("id")
    .limit(1);
  const c = data?.[0];
  if (!c) throw new Error("No hay clases en el planeador: esta prueba necesita datos.");
  return { claseId: String(c.id), profesorId: String(c.profesor_id) };
}

async function unaAcademia() {
  const { data } = await admin().from("academias").select("id").order("id").limit(1);
  const a = data?.[0];
  if (!a) throw new Error("No hay academias: esta prueba necesita datos.");
  return String(a.id);
}

describe("las pantallas de academias se renderizan enteras", () => {
  it("el planeador de la semana", async () => {
    const { default: Page } = await import("../src/app/(app)/academias/page");
    const html = await render(Page, { searchParams: P({}) });
    const t = texto(html);
    expect(t).toContain("Academias");
    expect(t).toContain("Clases a la semana");
    expect(t).toContain("Profesor");
    // Por profesor (opción C): cada clase del planeador sale UNA vez, aunque el
    // profesor no aparezca en el directorio (con service_role salen sin nombre).
    const { count } = await admin()
      .from("clase_semanal")
      .select("id", { count: "exact", head: true })
      .eq("activa", true)
      .eq("deporte", "tenis");
    const enlaces = html.match(/href="\/academias\/clase\/\d+"/g) ?? [];
    expect(enlaces.length).toBe(count);
    // Sin marcas de competencia en el planeador (pedido de Laura, 23-sep-2026).
    expect(t).not.toContain("COMP");
  });

  it("el planeador acepta el aviso que le deja borrar una clase", async () => {
    const { default: Page } = await import("../src/app/(app)/academias/page");
    const html = await render(Page, { searchParams: P({ aviso: "Clase borrada." }) });
    expect(texto(html)).toContain("Clase borrada.");
  });

  it("la semana de un profesor", async () => {
    const { profesorId } = await unaClase();
    const { default: Page } = await import("../src/app/(app)/academias/profesor/[id]/page");
    const html = await render(Page, { params: P({ id: profesorId }) });
    const t = texto(html);
    expect(t).toContain("Clases a la semana");
    expect(t).toContain("Horas de cancha");
  });

  it("la ficha de una clase, con su roster", async () => {
    const { claseId } = await unaClase();
    const { default: Page } = await import("../src/app/(app)/academias/clase/[id]/page");
    const html = await render(Page, { params: P({ id: claseId }) });
    const t = texto(html);
    expect(t).toContain("Sin tope de cupo");
    expect(t).toMatch(/\d+ niños?/);
  });

  it("la matrícula de una academia", async () => {
    const academiaId = await unaAcademia();
    const { default: Page } = await import("../src/app/(app)/academias/[id]/page");
    const html = await render(Page, { params: P({ id: academiaId }) });
    const t = texto(html);
    expect(t).toContain("Matrícula");
    expect(t).toContain("Niños matriculados");
    // El bloque "Información" (servicio de Siigo y precios de referencia en $0) se quitó: no aportaba.
    expect(t).not.toContain("Servicio en Siigo");
  });

  it("crear clase, editar clase y editar academia", async () => {
    const { claseId, profesorId } = await unaClase();
    const academiaId = await unaAcademia();
    const nueva = await import("../src/app/(app)/academias/clase/nueva/page");
    const editarClase = await import("../src/app/(app)/academias/clase/[id]/editar/page");
    const editarAca = await import("../src/app/(app)/academias/[id]/editar/page");
    expect(texto(await render(nueva.default, { searchParams: P({ profesor: profesorId }) }))).toContain("Nueva clase");
    expect(texto(await render(editarClase.default, { params: P({ id: claseId }) }))).toContain("Editar clase");
    expect(texto(await render(editarAca.default, { params: P({ id: academiaId }) }))).toContain("academia");
  });

  it("una clase que no existe da 404 en vez de reventar", async () => {
    const { default: Page } = await import("../src/app/(app)/academias/clase/[id]/page");
    await expect(render(Page, { params: P({ id: "999999" }) })).rejects.toThrow("NOT_FOUND");
  });

  it("el planeador cuenta CLASES, no niños — el error del Excel del club", async () => {
    // El Excel cuenta una fila de niño como media hora de profesor, así que una
    // clase de 4 le sale como 2 horas y el martes de Graciano marcaba 175% de
    // ocupación. Aquí las horas salen de la duración de la CLASE.
    const { data } = await admin().rpc("planeador_semana", { p_deporte: "tenis" });
    const horas = (data ?? []).reduce((n: number, c: any) => n + c.duracion_min, 0) / 60;
    const ninos = (data ?? []).reduce((n: number, c: any) => n + c.ninos, 0);
    expect(horas).toBeLessThan(ninos); // 48,5 h contra 170 cupos
    expect(horas).toBeGreaterThan(0);
  });

  it("nadie queda matriculado sin ninguna clase", async () => {
    // Un niño matriculado sin día no viene a nada y no se ve en el planeador:
    // es el fallo callado que la ficha de la academia tiene que gritar.
    const { data: insc } = await admin().from("inscripciones").select("id").eq("activa", true);
    const { data: links } = await admin().from("inscripcion_clase").select("inscripcion_id");
    const con = new Set((links ?? []).map((l) => l.inscripcion_id));
    const sin = (insc ?? []).filter((i) => !con.has(i.id));
    expect(sin.length).toBe(0);
  });

  it("el cierre de una clase de academia espera EXACTAMENTE a los de esa clase", async () => {
    // Antes había que adivinar el roster cruzando día + hora ±20 min contra las
    // franjas del grupo, y eso repartía mal a los grupos que compartían cancha.
    // Ahora la clase registrada guarda de qué celda del planeador salió.
    const { claseId, profesorId } = await unaClase();
    const { data: esperados } = await admin().rpc("clase_semanal_roster", { p_clase: Number(claseId) });
    const { data: nueva } = await admin()
      .from("clases")
      .insert({
        tipo: "academia", clase_semanal_id: Number(claseId), profesor_id: profesorId,
        deporte: "tenis", // Fecha pasada a propósito: una clase no se puede cerrar antes de empezar,
        // y el formulario solo se pinta cuando ya arrancó.
        fecha: "2026-09-01", hora_inicio: "16:00:00", hora_fin: "17:00:00",
        precio: 0, estado: "programada",
      })
      .select("id")
      .single();
    try {
      const { default: Page } = await import("../src/app/(app)/cierre/[id]/page");
      const t = texto(await render(Page, { params: P({ id: String(nueva!.id) }) }));
      expect(esperados?.length).toBeGreaterThan(0);
      for (const n of esperados ?? []) expect(t).toContain(n.nombre);
      expect(t).toContain("se esperaban");
    } finally {
      await admin().from("clases").delete().eq("id", nueva!.id);
    }
  });

  it("una clase de academia vieja, sin celda del planeador, no revienta", async () => {
    // Las 3 clases de agosto se registraron con el modelo viejo y no tienen
    // `clase_semanal_id`. Tienen que seguir abriéndose: se cae a la lista de
    // toda la academia en vez de dejar la pantalla en blanco.
    const { data } = await admin()
      .from("clases")
      .select("id")
      .eq("tipo", "academia")
      .is("clase_semanal_id", null)
      .limit(1);
    if (!data?.[0]) return;
    const { default: Page } = await import("../src/app/(app)/cierre/[id]/page");
    const t = texto(await render(Page, { params: P({ id: String(data[0].id) }) }));
    expect(t).toContain("no tiene a nadie apuntado");
    expect(t).toContain("Vino de reposición");
  });

  it("/cierre saca las academias del planeador, sin que nadie las registre antes", async () => {
    // Se siembra UNA clase del planeador a una hora que nadie usa (06:15) y con
    // el piso en el pasado, para que la cola la proponga hoy. Se borra al final.
    const { profesorId } = await unaClase();
    // Ayer, o el último día que no fue festivo: en festivo la academia no dicta y
    // la cola no lo propone (esto falló el martes 3-nov-2026, tras el lunes festivo).
    const { data: festivos } = await admin().from("festivo").select("fecha");
    const noDicta = new Set((festivos ?? []).map((f: { fecha: string }) => f.fecha));
    const ayer = new Date();
    do ayer.setDate(ayer.getDate() - 1);
    while (noDicta.has(fechaLocal(ayer)));
    const fecha = fechaLocal(ayer);
    const { data: cs } = await admin()
      .from("clase_semanal")
      .insert({
        profesor_id: profesorId, deporte: "tenis", dia_semana: ayer.getDay(),
        hora_inicio: "06:15:00", duracion_min: 60, vigente_desde: "2026-01-01",
      })
      .select("id")
      .single();
    try {
      const { data: pend } = await admin().rpc("academia_pendientes", {
        p_desde: fecha, p_hasta: fecha, p_profesor: profesorId,
      });
      expect(pend?.some((p: { clase_id: number; fecha: string }) => p.clase_id === cs!.id && p.fecha === fecha)).toBe(true);

      const { default: Page } = await import("../src/app/(app)/cierre/page");
      const t = texto(await render(Page, { searchParams: P({}) }));
      expect(t).toContain("Academias ·");
      expect(t).toContain("Salen del planeador");
      expect(t).toContain("06:15");
    } finally {
      await admin().from("clase_semanal").delete().eq("id", cs!.id);
    }
  });

  it("las clases vencidas de academia también salen del planeador", async () => {
    const { default: Page } = await import("../src/app/(app)/cierre/vencidas/page");
    const t = texto(await render(Page, {}));
    expect(t).toContain("Clases vencidas");
  });

  it("pausar academias: el planeador y el cierre lo dicen, y al quitarla vuelve todo", async () => {
    // Si alguien olvida reactivar, nada falla: solo dejan de pedirse cierres.
    // Por eso las dos pantallas tienen que decirlo mientras dure.
    const { data: yaHay } = await admin().from("academia_pausa").select("id").is("hasta", null).maybeSingle();
    if (yaHay) return; // hay una pausa real corriendo: no se toca
    const { data: p } = await admin().from("academia_pausa").insert({ desde: "2026-09-01" }).select("id").single();
    try {
      const plan = await import("../src/app/(app)/academias/page");
      const t1 = texto(await render(plan.default, { searchParams: P({}) }));
      expect(t1).toContain("Academias en pausa desde el 1 de sep");
      expect(t1).toContain("Reactivar academias");
      const cierre = await import("../src/app/(app)/cierre/page");
      const t2 = texto(await render(cierre.default, { searchParams: P({}) }));
      expect(t2).toContain("Academias en pausa desde el 1 de sep");
    } finally {
      await admin().from("academia_pausa").delete().eq("id", p!.id);
    }
    const plan = await import("../src/app/(app)/academias/page");
    expect(texto(await render(plan.default, { searchParams: P({}) }))).toContain("Academias activas");
  });

  it("el coordinador deportivo ve el botón de descargar inscritos; recepción no", async () => {
    const { default: Page } = await import("../src/app/(app)/academias/page");
    const rolReal = PERFIL.role;
    try {
      PERFIL.role = "coord_deportivo";
      const html = await render(Page, { searchParams: P({}) });
      expect(html).toContain('href="/academias/exportar"');
      expect(texto(html)).toContain("Descargar inscritos por profesor");
      PERFIL.role = "recepcion";
      expect(await render(Page, { searchParams: P({}) })).not.toContain("/academias/exportar");
    } finally {
      PERFIL.role = rolReal;
    }
  });

  it("solo el superadministrador ve el botón de pausar academias", async () => {
    const { default: Page } = await import("../src/app/(app)/academias/page");
    const rolReal = PERFIL.role;
    try {
      PERFIL.role = "coord_deportivo";
      const t = texto(await render(Page, { searchParams: P({}) }));
      expect(t).not.toContain("Pausar academias");
      PERFIL.role = "superadmin";
      expect(texto(await render(Page, { searchParams: P({}) }))).toContain("Pausar academias");
    } finally {
      PERFIL.role = rolReal;
    }
  });

  it("la acción de pausar rechaza a quien no es superadministrador", async () => {
    // El guardia de la pantalla no protege la acción: se prueba aparte.
    const { pausarAcademias } = await import("../src/app/(app)/academias/actions");
    const auth = await import("@/lib/auth");
    // Pide la lista de roles que exige la acción: si incluyera a coordinación
    // (como el resto del módulo), esta prueba no lanzaría.
    const spy = vi.spyOn(auth, "requireRole").mockImplementation(async (roles: string[]) => {
      if (!roles.includes("coord_deportivo")) throw new Error("REDIRECT sin permiso");
      return PERFIL as never;
    });
    try {
      await expect(pausarAcademias({}, new FormData())).rejects.toThrow("sin permiso");
    } finally {
      spy.mockRestore();
    }
  });

  it("la matrícula muestra el reparto real y la tabla con buscador", async () => {
    const academiaId = await unaAcademia();
    const { default: Page } = await import("../src/app/(app)/academias/[id]/page");
    const t = texto(await render(Page, { params: P({ id: academiaId }) }));
    expect(t).toContain("Cuántas veces vienen a la semana");
    expect(t).toContain("Por edad");
  });

  it("«no se dictó» exige motivo, y con él saca la clase de la cola", async () => {
    // Sin motivo obligatorio, una clase cancelada por receso y una cancelada por
    // olvido se ven idénticas — y se arreglan distinto: una está bien y la otra
    // hay que reponerla.
    const { claseId, profesorId } = await unaClase();
    const fecha = await diaLibre(Number(claseId));
    const { data: c } = await admin()
      .from("clases")
      .insert({
        tipo: "academia", clase_semanal_id: Number(claseId), profesor_id: profesorId,
        deporte: "tenis", fecha, hora_inicio: "06:05:00", hora_fin: "07:05:00",
        precio: 0, estado: "programada",
      })
      .select("id")
      .single();
    try {
      const { cerrarClase } = await import("../src/app/(app)/cierre/actions");
      const sinMotivo = new FormData();
      sinMotivo.set("claseId", String(c!.id));
      sinMotivo.set("estado", "cancelada");
      const r1 = await cerrarClase({}, sinMotivo);
      expect(r1.error).toMatch(/por qué no se dictó/i);

      const conMotivo = new FormData();
      conMotivo.set("claseId", String(c!.id));
      conMotivo.set("estado", "cancelada");
      conMotivo.set("motivo_cancelacion", "Semana de receso");
      // Al cerrar bien, la acción redirige a la cola; el arnés convierte el
      // redirect en excepción, así que es la señal de éxito.
      await expect(cerrarClase({}, conMotivo)).rejects.toThrow("REDIRECT /cierre?ok=cancelada");

      const { data: despues } = await admin()
        .from("clases")
        .select("estado, motivo_cancelacion")
        .eq("id", c!.id)
        .single();
      expect(despues?.estado).toBe("cancelada");
      expect(despues?.motivo_cancelacion).toBe("Semana de receso");
    } finally {
      await admin().from("clases").delete().eq("id", c!.id);
    }
  });

  it("el planeador de pádel: sus clases y la de colegio Montessori, sin tocar tenis", async () => {
    const { default: Page } = await import("../src/app/(app)/academias/page");
    const html = await render(Page, { searchParams: P({ deporte: "padel" }) });
    const t = texto(html);
    const { count } = await admin()
      .from("clase_semanal")
      .select("id", { count: "exact", head: true })
      .eq("activa", true)
      .eq("deporte", "padel");
    expect(count).toBeGreaterThan(0);
    const enlaces = html.match(/href="\/academias\/clase\/\d+"/g) ?? [];
    expect(enlaces.length).toBe(count);
    expect(t).toContain("Montessori");
    expect(html).toContain('href="/academias/clase/nueva?deporte=padel"');
    // Joaquín dejó las academias (sus reglas de academia están apagadas): no sale.
    const { data: joaquin } = await admin().from("profiles").select("id").ilike("nombre", "Joaqu%Della Mea").maybeSingle();
    if (joaquin) expect(html).not.toContain(`/academias/profesor/${joaquin.id}`);
  });

  it("una clase de colegio: sin lista en su ficha y se cierra sin asistencia", async () => {
    const { data: cs } = await admin()
      .from("clase_semanal")
      .select("id, profesor_id")
      .not("colegio", "is", null)
      .limit(1)
      .single();
    expect(cs).toBeTruthy();

    const { default: Ficha } = await import("../src/app/(app)/academias/clase/[id]/page");
    const ficha = texto(await render(Ficha, { params: P({ id: String(cs!.id) }) }));
    expect(ficha).toContain("no lleva niños inscritos");
    expect(ficha).not.toContain("Agregar");

    // Un día pasado SIN clase real de esa celda (ver `diaLibre`): el club cierra el Montessori
    // de cada martes y el insert de la prueba se rechazaba todos los miércoles (28-oct-2026).
    const fecha = await diaLibre(cs!.id);
    const { data: c } = await admin()
      .from("clases")
      .insert({
        tipo: "academia", clase_semanal_id: cs!.id, profesor_id: cs!.profesor_id,
        deporte: "padel", fecha, hora_inicio: "06:10:00",
        hora_fin: "07:10:00", precio: 0, estado: "programada",
      })
      .select("id")
      .single();
    try {
      const { default: Cierre } = await import("../src/app/(app)/cierre/[id]/page");
      const pc = texto(await render(Cierre, { params: P({ id: String(c!.id) }) }));
      expect(pc).toContain("Colegio Montessori");
      expect(pc).not.toContain("no tiene a nadie apuntado");

      const { cerrarClase } = await import("../src/app/(app)/cierre/actions");
      const fd = new FormData();
      fd.set("claseId", String(c!.id));
      fd.set("estado", "realizada");
      await expect(cerrarClase({}, fd)).rejects.toThrow(/REDIRECT \/cierre/);
      const { data: despues } = await admin().from("clases").select("estado").eq("id", c!.id).single();
      expect(despues?.estado).toBe("realizada");
    } finally {
      await admin().from("asistencias").delete().eq("clase_id", c!.id);
      await admin().from("clases").delete().eq("id", c!.id);
    }
  });

  it("el cierre de academia muestra a los niños de ESA clase con asistió / no asistió / excusa médica", async () => {
    const { data: cs } = await admin()
      .from("clase_semanal").select("id, profesor_id").eq("deporte", "padel").is("colegio", null).limit(1).single();
    const { data: roster } = await admin().rpc("clase_semanal_roster", { p_clase: cs!.id });
    const fecha = await diaLibre(cs!.id);
    const { data: c } = await admin().from("clases").insert({
      tipo: "academia", clase_semanal_id: cs!.id, profesor_id: cs!.profesor_id, deporte: "padel",
      fecha, hora_inicio: "06:20:00", hora_fin: "07:20:00", precio: 0, estado: "programada",
    }).select("id").single();
    try {
      const { default: Cierre } = await import("../src/app/(app)/cierre/[id]/page");
      const html = await render(Cierre, { params: P({ id: String(c!.id) }) });
      const t = texto(html);
      for (const n of roster ?? []) expect(t).toContain(n.nombre);
      expect(html.match(/<option value="presente"[^>]*>Asistió<\/option>/g)?.length).toBe(roster!.length);
      expect(t).toContain("No asistió con excusa médica");
      expect(t).toContain("No asistió");
    } finally {
      await admin().from("clases").delete().eq("id", c!.id);
    }
  });

  it("el profesor tiene 48 h para cerrar su clase; después, solo el superadministrador", async () => {
    // Eran 24 h hasta el 10-nov-2026. Se prueba la ACCIÓN, no solo el cálculo:
    // el plazo solo vive en la aplicación (la base no lo hace cumplir).
    const H = 3_600_000;
    /** Fecha y hora de Bogotá de hace `horas` horas, como las guarda `clases`. */
    const hace = (horas: number) => {
      const p = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Bogota",
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", hourCycle: "h23",
      })
        .formatToParts(new Date(Date.now() - horas * H))
        .reduce((a, x) => ({ ...a, [x.type]: x.value }), {} as Record<string, string>);
      return { fecha: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}:00` };
    };
    const crear = async (horas: number) => {
      const { fecha, hora } = hace(horas);
      const { data, error } = await admin().from("clases").insert({
        // Suya: el profesor solo cierra las que dictó él.
        tipo: "individual", profesor_id: PERFIL.id, deporte: "tenis", fecha,
        hora_inicio: hora, hora_fin: hora, precio: 100000, estado: "programada",
      }).select("id").single();
      if (error) throw new Error(`No se pudo crear la clase de prueba: ${error.message}`);
      return data!.id as number;
    };
    const { cerrarClase } = await import("../src/app/(app)/cierre/actions");
    /** Intenta cerrarla como «no se dictó» SIN motivo: si pasa el plazo, el error
     *  es el del motivo, y no se escribe nada. Así se prueba el plazo sin cerrar. */
    const intento = async (id: number) => {
      const fd = new FormData();
      fd.set("claseId", String(id));
      fd.set("estado", "cancelada");
      return (await cerrarClase({}, fd)).error ?? "";
    };

    const a30 = await crear(30);
    const a50 = await crear(50);
    const rolAntes = PERFIL.role;
    try {
      PERFIL.role = "profesor";
      // A las 30 h (con el plazo viejo ya estaba vencida) el plazo lo deja pasar.
      expect(await intento(a30)).toMatch(/por qué no se dictó/i);
      // A las 50 h ya no: se lo tiene que pedir al superadministrador.
      expect(await intento(a50)).toMatch(/más de 48 h/i);
      expect(await intento(a50)).toMatch(/superadministrador/i);
      // Y el superadministrador sí pasa, que es para lo que existe /cierre/vencidas.
      PERFIL.role = "superadmin";
      expect(await intento(a50)).toMatch(/por qué no se dictó/i);
    } finally {
      PERFIL.role = rolAntes;
      await admin().from("clases").delete().in("id", [a30, a50]);
    }
    // Ninguno de los intentos la cerró: no quedó nada escrito.
    const { count } = await admin().from("clases").select("id", { count: "exact", head: true }).in("id", [a30, a50]);
    expect(count).toBe(0);
  });

  it("eliminar una clase pendiente: solo el superadministrador", async () => {
    const { data: prof } = await admin().from("profiles").select("id").eq("role", "profesor").eq("activo", true).limit(1).single();
    const ayer = new Date(); ayer.setDate(ayer.getDate() - 1);
    const fecha = fechaLocal(ayer);
    const { data: c } = await admin().from("clases").insert({
      tipo: "individual", profesor_id: prof!.id, deporte: "tenis", fecha,
      hora_inicio: "06:25:00", hora_fin: "07:25:00", precio: 100000, estado: "programada",
    }).select("id").single();
    const { default: Cierre } = await import("../src/app/(app)/cierre/[id]/page");
    const { eliminarClasePendiente } = await import("../src/app/(app)/cierre/actions");
    const auth = await import("@/lib/auth");
    try {
      // El superadministrador ve el botón…
      expect(texto(await render(Cierre, { params: P({ id: String(c!.id) }) }))).toContain("Eliminar esta clase");
      // …el profesor no, y la acción lo rechaza aunque la llame directo.
      const rolAntes = PERFIL.role;
      PERFIL.role = "profesor";
      try {
        expect(texto(await render(Cierre, { params: P({ id: String(c!.id) }) }))).not.toContain("Eliminar esta clase");
      } finally {
        PERFIL.role = rolAntes;
      }
      const spy = vi.spyOn(auth, "requireRole").mockImplementation(async (roles: string[]) => {
        if (!roles.includes("profesor")) throw new Error("REDIRECT sin permiso");
        return PERFIL as never;
      });
      try {
        await expect(eliminarClasePendiente(c!.id, "")).rejects.toThrow("sin permiso");
      } finally {
        spy.mockRestore();
      }

      await expect(eliminarClasePendiente(c!.id, "prueba")).rejects.toThrow(/REDIRECT \/cierre\?aviso=/);
      const { data: ya } = await admin().from("clases").select("id").eq("id", c!.id).maybeSingle();
      expect(ya).toBeNull();
    } finally {
      await admin().from("clases").delete().eq("id", c!.id);
    }
  });

  it("eliminar una clase del planeador la deja como «no se dictó» (si no, el planeador la vuelve a pedir)", async () => {
    const { data: cs } = await admin().from("clase_semanal").select("id, profesor_id").eq("deporte", "padel").limit(1).single();
    const { data: c } = await admin().from("clases").insert({
      tipo: "academia", clase_semanal_id: cs!.id, profesor_id: cs!.profesor_id, deporte: "padel",
      fecha: "2026-01-05", hora_inicio: "06:30:00", hora_fin: "07:30:00", precio: 0, estado: "programada",
    }).select("id").single();
    try {
      const { eliminarClasePendiente } = await import("../src/app/(app)/cierre/actions");
      await expect(eliminarClasePendiente(c!.id, "")).rejects.toThrow(/REDIRECT/);
      const { data: d } = await admin().from("clases").select("estado, motivo_cancelacion").eq("id", c!.id).single();
      expect(d?.estado).toBe("cancelada");
      expect(d?.motivo_cancelacion).toMatch(/superadministrador/);
    } finally {
      await admin().from("clases").delete().eq("id", c!.id);
    }
  });

  it("el modal de /clases ya no ofrece registrar un bloqueo de academia", async () => {
    // Dejar el botón confundía a cafetería, que no tiene nada que hacer con las
    // academias desde que salen solas del planeador.
    const mod = await import("../src/app/(app)/clases/actions");
    expect("prepararAcademia" in mod).toBe(false);
    expect("materializarAcademia" in mod).toBe(false);
  });
});
