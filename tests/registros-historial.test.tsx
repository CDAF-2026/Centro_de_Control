import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createClient as sb } from "@supabase/supabase-js";

/**
 * Historial de la bandeja de registros (28-oct-2026, pedido de la clienta): "Deportista" es la persona
 * que se registró, no el titular de la ficha. Camilo Arias firmó por Mariana e Ismael y la tabla decía
 * "Camilo Arias" las cuatro veces; Guadalupe Espinoza salía cuatro veces aunque dos eran de su hermana Mia.
 * Monta la página de verdad sobre la base, con dos solicitudes de prueba que se borran en `finally`.
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
/** La fila del historial cuyo "Quién" es `marca` (solo la tabla: la tarjeta pendiente de arriba también lo nombra). */
const fila = (html: string, marca: string) => texto(html.slice(html.indexOf("<tbody")).split("<tr").find((tr) => tr.includes(marca)) ?? "");

describe("historial de registros · columna Deportista", () => {
  it("muestra a la persona registrada (el hijo), no al titular de la ficha", async () => {
    const { data: hijo } = await admin.from("cliente_miembros").select("id, cliente_id, nombres, apellidos").eq("es_titular", false).eq("activo", true).order("id").limit(1).single();
    const { data: ficha } = await admin.from("clientes").select("nombres, apellidos").eq("id", hijo!.cliente_id).single();
    const titular = `${ficha!.nombres} ${ficha!.apellidos}`;
    const nombreHijo = `${hijo!.nombres} ${hijo!.apellidos}`;
    expect(nombreHijo).not.toBe(titular);

    const { data: conMiembro } = await admin.from("registro_solicitud").insert({
      tipo: "consentimiento", estado: "aplicada", cliente_id: hijo!.cliente_id, miembro_id: hijo!.id,
      payload: { firmante: { nombre: "Firmante Prueba Historial A" } },
    }).select("id").single();
    // Sin miembro (solicitud vieja): sale lo que escribió la familia, no el titular.
    const { data: sinMiembro } = await admin.from("registro_solicitud").insert({
      tipo: "datos", estado: "aplicada", cliente_id: hijo!.cliente_id,
      payload: { menor: { nombres: "Hija", apellidos: "Escrita En El Formulario" }, firmante: { nombre: "Firmante Prueba Historial B" } },
    }).select("id").single();
    try {
      const { default: Page } = await import("../src/app/(app)/clientes/registros/page");
      const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }));
      const a = fila(html, "Firmante Prueba Historial A");
      expect(a).toContain(nombreHijo);
      expect(a).not.toContain(titular);
      const b = fila(html, "Firmante Prueba Historial B");
      expect(b).toContain("Hija Escrita En El Formulario");
      expect(b).not.toContain(titular);
    } finally {
      await admin.from("registro_solicitud").delete().in("id", [conMiembro!.id, sinMiembro!.id]);
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
      const { default: Page } = await import("../src/app/(app)/clientes/registros/page");
      const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }));
      const c = fila(html, "Firmante Prueba Historial C");
      expect(c).toContain("Ficha actualizada");
      expect(c).not.toContain("por aprobar");
      expect(fila(html, "Firmante Prueba Historial D")).toContain("1 de facturación por aprobar");
    } finally {
      await admin.from("registro_cambio").delete().eq("id", cambio!.id);
      await admin.from("registro_solicitud").delete().in("id", [resuelta!.id, pendiente!.id]);
    }
  }, 30_000);
});
