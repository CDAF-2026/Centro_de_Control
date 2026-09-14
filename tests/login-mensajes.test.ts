import { describe, expect, it } from "vitest";
import {
  MSG_CREDENCIALES,
  MSG_DEMASIADOS,
  MSG_SIN_ACCESO,
  MSG_SISTEMA,
  mensajeLogin,
} from "@/lib/auth/mensajes";

describe("mensajeLogin", () => {
  it("la clave mala sí dice que la clave está mal", () => {
    expect(mensajeLogin({ status: 400, code: "invalid_credentials" })).toBe(MSG_CREDENCIALES);
  });

  // El caso del 14-sep-2026: Supabase pausado por facturas sin pagar. La
  // petición ni llega, así que el error viene SIN status.
  it("sin respuesta del servidor NO culpa a la contraseña", () => {
    expect(mensajeLogin({ code: undefined })).toBe(MSG_SISTEMA);
    expect(mensajeLogin({})).toBe(MSG_SISTEMA);
  });

  it("un 5xx tampoco culpa a la contraseña", () => {
    for (const status of [500, 502, 503, 504]) {
      expect(mensajeLogin({ status })).toBe(MSG_SISTEMA);
    }
  });

  it("al empleado baneado se le dice que no tiene acceso, no que se equivocó", () => {
    expect(mensajeLogin({ status: 403, code: "user_banned" })).toBe(MSG_SIN_ACCESO);
  });

  it("el tope de intentos se explica aparte", () => {
    expect(mensajeLogin({ status: 429, code: "over_request_rate_limit" })).toBe(MSG_DEMASIADOS);
  });

  it("ningún mensaje del sistema se parece al de la clave", () => {
    expect(new Set([MSG_CREDENCIALES, MSG_SIN_ACCESO, MSG_DEMASIADOS, MSG_SISTEMA]).size).toBe(4);
  });
});
