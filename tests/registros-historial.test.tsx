import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createClient as sb } from "@supabase/supabase-js";

/**
 * Historial de la bandeja de registros (28-oct-2026, pedidos de la clienta y de Laura):
 * - "Deportista" es la persona que se registró, no el titular de la ficha (Camilo Arias firmó por
 *   Mariana e Ismael y la tabla decía "Camilo Arias" cuatro veces).
 * - Opción A: UNA fila por persona y visita (datos + firma juntos), columnas Fecha · Deportista ·
 *   Lo registró · Hizo · Avisos.
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

async function pagina() {
  const { default: Page } = await import("../src/app/(app)/clientes/registros/page");
  return renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }));
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
      expect(a).toContain("Acudiente Prueba Historial A · madre");
      expect(a).toMatch(/Datos.*Firma/);
      expect(a).toContain("Ficha nueva");
      expect(a).toContain("Sin fotos");

      const b = fila(html, "Acudiente Prueba Historial B");
      expect(b).toContain("Hija Escrita En El Formulario");
      expect(b).toContain("Acudiente Prueba Historial B · padre");
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
});
