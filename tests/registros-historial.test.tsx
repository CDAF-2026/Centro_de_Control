import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createClient as sb } from "@supabase/supabase-js";

/**
 * Historial de la bandeja de registros (28-oct-2026, pedidos de la clienta y de Laura):
 * - "Deportista" es la persona que se registró, no el titular de la ficha (Camilo Arias firmó por
 *   Mariana e Ismael y la tabla decía "Camilo Arias" cuatro veces).
 * - Opción A: UNA fila por persona y visita (datos + firma juntos), columnas Fecha · Deportista ·
 *   Lo registró · Hizo · Avisos, de 20 en 20 (la base agrupa y pagina: `registro_historial`).
 * - "N de facturación por aprobar" cuenta lo que falta hoy, no la foto de cuando llegó.
 * Monta la página de verdad sobre la base, con solicitudes de prueba que se borran en `finally`.
 */
vi.mock("next/link", () => ({
  default: ({ href, children, ...r }: any) => React.createElement("a", { href: String(href), ...r }, children),
}));

const admin = sb(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => admin, createAdminClient: () => admin }));
vi.mock("@/lib/auth", () => ({
  requireRole: async () => ({ id: "", role: "superadmin", nombre: "test", activo: true }),
  requireProfile: async () => ({ id: "", role: "superadmin", nombre: "test", activo: true }),
  getProfile: async () => ({ id: "", role: "superadmin", nombre: "test", activo: true }),
}));

const texto = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
/** Las filas del historial (solo la tabla: la tarjeta pendiente de arriba también nombra a quien envió). */
const filas = (html: string) => html.slice(html.indexOf("<tbody")).split("<tr").slice(1).map(texto);
const fila = (html: string, marca: string) => filas(html).find((f) => f.includes(marca)) ?? "";

async function pagina(params: { filtro?: string; pagina?: string } = {}) {
  const { default: Page } = await import("../src/app/(app)/clientes/registros/page");
  return renderToStaticMarkup(await Page({ searchParams: Promise.resolve(params) }));
}

describe("historial de registros", () => {
  it("una fila por persona: el hijo (no el titular), quién lo registró, datos y firma juntos y sus avisos", async () => {
    const { data: hijo } = await admin.from("cliente_miembros").select("id, cliente_id, nombres, apellidos").eq("es_titular", false).eq("activo", true).order("id").limit(1).single();
    const { data: ficha } = await admin.from("clientes").select("nombres, apellidos").eq("id", hijo!.cliente_id).single();
    const titular = `${ficha!.nombres} ${ficha!.apellidos}`;
    const nombreHijo = `${hijo!.nombres} ${hijo!.apellidos}`;
    expect(nombreHijo).not.toBe(titular);

    const { data: sols } = await admin.from("registro_solicitud").insert([
      { tipo: "datos", estado: "aplicada", cliente_id: hijo!.cliente_id, miembro_id: hijo!.id, resultado: { modo: "actualizar", creada: true },
        payload: { menor: { nombres: "Escrito", apellidos: "Por La Familia" }, acudientes: [{ nombre: "Acudiente Prueba Historial A", rol: "madre", principal: true }] } },
      { tipo: "consentimiento", estado: "aplicada", cliente_id: hijo!.cliente_id, miembro_id: hijo!.id,
        payload: { firmante: { nombre: "Acudiente Prueba Historial A", parentesco: "Madre" }, autoriza: { salud: true, imagen: false, informacion: true } } },
      // Sin miembro (solicitud vieja): sale lo que escribió la familia, no el titular.
      { tipo: "datos", estado: "aplicada", cliente_id: hijo!.cliente_id,
        payload: { menor: { nombres: "Hija", apellidos: "Escrita En El Formulario" }, acudientes: [{ nombre: "Acudiente Prueba Historial B", rol: "padre", principal: true }] } },
      // Un adulto que se registra y firma a sí mismo.
      { tipo: "consentimiento", estado: "aplicada", cliente_id: hijo!.cliente_id,
        payload: { menor: { nombres: "Adulta", apellidos: "Prueba Propia Historial" }, firmante: { nombre: "Adulta Prueba Propia Historial", parentesco: null } } },
    ]).select("id");
    try {
      const html = await pagina();
      const t = texto(html);
      expect(t).toContain("Lo registró");
      expect(t).not.toMatch(/Consentimientos · \d/);

      const conA = filas(html).filter((f) => f.includes("Acudiente Prueba Historial A"));
      expect(conA).toHaveLength(1);
      const a = conA[0];
      expect(a).toContain(nombreHijo);
      expect(a).not.toContain(titular);
      expect(a).toMatch(/Acudiente Prueba Historial A madre/);
      expect(a).toMatch(/Datos.*Firma/);
      expect(a).toContain("Ficha nueva");
      expect(a).toContain("Sin fotos");

      const b = fila(html, "Acudiente Prueba Historial B");
      expect(b).toContain("Hija Escrita En El Formulario");
      expect(b).toMatch(/Acudiente Prueba Historial B padre/);
      expect(b).not.toContain(titular);

      expect(fila(html, "Adulta Prueba Propia Historial")).toContain("El propio deportista");
    } finally {
      await admin.from("registro_solicitud").delete().in("id", (sols ?? []).map((s) => s.id));
    }
  }, 30_000);

  it("'N de facturación por aprobar' cuenta lo que de verdad falta, no la foto de cuando llegó", async () => {
    const { data: cli } = await admin.from("clientes").select("id").order("id").limit(1).single();
    // Llegó con 4 por aprobar y ya se decidieron: no debe decir nada.
    const { data: resuelta } = await admin.from("registro_solicitud").insert({
      tipo: "datos", estado: "aplicada", cliente_id: cli!.id, resultado: { modo: "actualizar", creada: false, cambios_pendientes: 4 },
      payload: { menor: { nombres: "Ya", apellidos: "Resuelta" }, firmante: { nombre: "Firmante Prueba Historial C" } },
    }).select("id").single();
    // Le queda uno pendiente de verdad.
    const { data: pendiente } = await admin.from("registro_solicitud").insert({
      tipo: "datos", estado: "en_revision", cliente_id: cli!.id, resultado: { modo: "actualizar", creada: false, cambios_pendientes: 3 },
      payload: { menor: { nombres: "Con", apellidos: "Pendiente" }, firmante: { nombre: "Firmante Prueba Historial D" } },
    }).select("id").single();
    const { data: cambio } = await admin.from("registro_cambio").insert({ solicitud_id: pendiente!.id, cliente_id: cli!.id, campo: "factura_a_nit", valor_nuevo: "9990000399" }).select("id").single();
    try {
      const html = await pagina();
      const c = fila(html, "Firmante Prueba Historial C");
      expect(c).toContain("Datos");
      expect(c).not.toContain("por aprobar");
      expect(fila(html, "Firmante Prueba Historial D")).toContain("1 de facturación por aprobar");
    } finally {
      await admin.from("registro_cambio").delete().eq("id", cambio!.id);
      await admin.from("registro_solicitud").delete().in("id", [resuelta!.id, pendiente!.id]);
    }
  }, 30_000);

  it("pagina de 20 en 20 y el filtro de revisión trae la visita descartada", async () => {
    const { data: cli } = await admin.from("clientes").select("id").order("id").limit(1).single();
    const { data: descartada } = await admin.from("registro_solicitud").insert({
      tipo: "consentimiento", estado: "rechazada", cliente_id: cli!.id, nota_revision: "Nota Prueba Historial E",
      payload: { menor: { nombres: "Firma", apellidos: "Repetida Prueba" }, firmante: { nombre: "Firmante Prueba Historial E", parentesco: "Madre" } },
    }).select("id").single();
    try {
      const { data: h } = await admin.rpc("registro_historial", { p_solo_revision: false, p_limite: 1, p_desde: 0 });
      const total = (h as { total: number }).total;
      expect(total).toBeGreaterThan(40);
      const ultimaPagina = Math.ceil(total / 20);

      const p1 = await pagina();
      expect(filas(p1)).toHaveLength(20);
      expect(texto(p1)).toContain(`Mostrando 1–20 de ${total}`);
      expect(p1).toContain('href="/clientes/registros?pagina=2"');

      const p2 = await pagina({ pagina: "2" });
      expect(texto(p2)).toContain(`Mostrando 21–40 de ${total}`);
      expect(p2).toContain('aria-current="page"');

      // Una página que no existe cae en la última.
      const lejos = await pagina({ pagina: "999" });
      expect(texto(lejos)).toContain(`de ${total}`);
      expect(texto(lejos)).toContain(`Mostrando ${(ultimaPagina - 1) * 20 + 1}–`);

      const rev = await pagina({ filtro: "revision" });
      const e = fila(rev, "Firmante Prueba Historial E");
      expect(e).toContain("Firma descartada");
      expect(e).toContain("Nota Prueba Historial E");
      expect(e).toContain("Sin datos");
    } finally {
      await admin.from("registro_solicitud").delete().eq("id", descartada!.id);
    }
  }, 60_000);
});
