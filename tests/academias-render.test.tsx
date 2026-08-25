import React from "react";
import { describe, it, expect, vi } from "vitest";
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

const PERFIL = { id: "00000000-0000-0000-0000-000000000000", role: "superadmin", nombre: "test", activo: true };
const admin = () =>
  sbClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

const P = <T,>(o: T) => Promise.resolve(o);
const render = async (fn: any, props: any) => renderToStaticMarkup(await fn(props));
const texto = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

/** Una academia y un grupo que existan de verdad, para no fijar ids a mano. */
async function unaAcademiaConGrupo() {
  const { data } = await admin()
    .from("academia_grupo")
    .select("id, academia_id")
    .eq("activo", true)
    .order("id")
    .limit(1);
  const g = data?.[0];
  if (!g) throw new Error("No hay grupos cargados: esta prueba necesita datos.");
  return { academiaId: String(g.academia_id), grupoId: String(g.id) };
}

describe("las pantallas de academias se renderizan enteras", () => {
  it("el listado", async () => {
    const { default: Page } = await import("../src/app/(app)/academias/page");
    const html = await render(Page, {});
    expect(texto(html)).toContain("Academias");
  });

  it("la ficha de una academia", async () => {
    const { academiaId } = await unaAcademiaConGrupo();
    const { default: Page } = await import("../src/app/(app)/academias/[id]/page");
    const html = await render(Page, { params: P({ id: academiaId }) });
    const t = texto(html);
    expect(t).toContain("Grupos");
    // Esta pantalla es de MATRÍCULA: grupos, niños y cupo. Lo de si la clase se
    // dictó o se cerró vive en /clases y /cierre, que es donde hay botón para
    // arreglarlo (decisión de Laura, ago-2026).
    expect(t).toContain("Cupos libres");
    expect(t).toContain("Franjas sobre cupo");
    expect(t).not.toContain("Cómo va el periodo");
    expect(t).not.toContain("por revisar");
  });

  it("la ficha de un grupo, con sus franjas desplegables", async () => {
    const { academiaId, grupoId } = await unaAcademiaConGrupo();
    const { default: Page } = await import("../src/app/(app)/academias/[id]/grupos/[grupoId]/page");
    const t = texto(await render(Page, { params: P({ id: academiaId, grupoId }), searchParams: P({}) }));
    expect(t).toContain("Franjas");
    // La asistencia se queda, pero POR NIÑO: es la que decide si se le cambia el
    // día o se le retira, y está al lado de esos botones.
    expect(t).not.toContain("sin clases en el periodo");
    expect(t).not.toContain("no se registró");
  });

  it("la ficha del grupo en los cuatro periodos", async () => {
    const { academiaId, grupoId } = await unaAcademiaConGrupo();
    const { default: Page } = await import("../src/app/(app)/academias/[id]/grupos/[grupoId]/page");
    for (const periodo of ["semana", "mes", "3m"]) {
      const html = await render(Page, { params: P({ id: academiaId, grupoId }), searchParams: P({ periodo }) });
      expect(texto(html)).toContain("Franjas");
    }
    const custom = await render(Page, {
      params: P({ id: academiaId, grupoId }),
      searchParams: P({ periodo: "custom", desde: "2026-06-01", hasta: "2026-06-30" }),
    });
    expect(texto(custom)).toContain("Franjas");
  });

  it("crear grupo, editar grupo y administrar franjas", async () => {
    const { academiaId, grupoId } = await unaAcademiaConGrupo();
    const nuevo = await import("../src/app/(app)/academias/[id]/grupos/nuevo/page");
    const editar = await import("../src/app/(app)/academias/[id]/grupos/[grupoId]/editar/page");
    const franjas = await import("../src/app/(app)/academias/[id]/grupos/[grupoId]/franjas/page");

    expect(texto(await render(nuevo.default, { params: P({ id: academiaId }) }))).toContain("Nuevo grupo");
    expect(texto(await render(editar.default, { params: P({ id: academiaId, grupoId }) }))).toContain("Editar grupo");
    expect(texto(await render(franjas.default, { params: P({ id: academiaId, grupoId }) }))).toContain("Franjas de");
  });

  it("inscribir a un niño, y reabrirlo para cambiarle los días", async () => {
    const { academiaId } = await unaAcademiaConGrupo();
    const { default: Page } = await import("../src/app/(app)/academias/[id]/inscribir/page");
    expect(texto(await render(Page, { params: P({ id: academiaId }), searchParams: P({}) }))).toContain("Inscribir un niño");

    const { data } = await admin().from("inscripciones").select("miembro_id").eq("academia_id", Number(academiaId)).limit(1);
    const miembro = data?.[0]?.miembro_id;
    if (miembro) {
      const edicion = await render(Page, { params: P({ id: academiaId }), searchParams: P({ miembro: String(miembro) }) });
      expect(texto(edicion)).toContain("Cambiar los días");
    }
  });
});
