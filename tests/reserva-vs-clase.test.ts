import { describe, it, expect } from "vitest";
import { pareceClase, profesorDeCancha } from "@/lib/easycancha/client";

/**
 * Distinguir una CLASE de un ALQUILER de cancha.
 *
 * El 15-sep-2026 en cafetería pulsaron "Particular" sobre el alquiler de Iván
 * Darío Botero y lo convirtieron en clase. Se consultó esa reserva en la API de
 * EasyCancha y llega como alquiler sin ambigüedad (`courtName: "Cancha 2"`,
 * `comments: null`): el error no fue de EasyCancha, fue que la plataforma
 * ofrecía "A un paquete / Particular" sobre CUALQUIER reserva. Se encontraron
 * 5 alquileres convertidos en clase, y se borraron.
 *
 * Los casos de abajo son reservas REALES, con el veredicto que confirmó la
 * dueña del club.
 */

const r = (courtName: string, comments: string | null) => ({ courtName, comments });

describe("la cancha con profesor en el nombre es clase segura", () => {
  it.each([
    "Profesor Leo Ruíz Cancha 3",
    "Entrenador  Cristian Castro - Cancha 2",
    "Entrenador Esteban Graciano -  Cancha 4",
    "Profesor Joaquín - Cancha 1",
  ])("%s", (cancha) => {
    expect(pareceClase(r(cancha, null))).toBe(true);
    expect(profesorDeCancha(cancha)).toBeTruthy();
  });
});

describe("en cancha pelada manda la nota de la reserva", () => {
  // Notas REALES de ago–sep 2026, tal cual las escribe el club.
  it.each([
    "Clase con entrenador Sebastián",
    "clase victor",
    "CLASE CON VICTOR",
    "Clase personalizada con Mauricio o Salamanca",
    "Personalizada con Mauro o Salamanca",
    "Entrenador Sebastian",
    "Clase de Tenis Elena Giraldo, con Cristian Castro",
    "clase con leo",
  ])("es CLASE: %s", (nota) => {
    expect(pareceClase(r("Cancha 2", nota))).toBe(true);
  });

  it.each([
    [null, "sin nota (el caso de Iván Darío Botero)"],
    ["", "nota vacía"],
    ["Celeste", "un nombre suelto"],
    ["esta mojada porque limpiaron los vidrios", "una nota de mantenimiento"],
  ])("es ALQUILER con %s (%s)", (nota) => {
    expect(pareceClase(r("Cancha 2", nota as string | null))).toBe(false);
  });
});

describe("los 6 casos que la dueña confirmó a mano", () => {
  // Medido contra la API el 15-sep-2026: 6 de 6.
  const CASOS: [string, string, string | null, boolean][] = [
    ["438 Iván Darío — alquiler del video", "Cancha 2", null, false],
    ["428 Felipe Escamilla", "Cancha 1", "Clase personalizada con entrenador Sebastián o Salamanca", true],
    ["392 Sebastián", "Cancha 3", "Clase con entrenador Sebastián", true],
    ["436 Sebastián", "Cancha 3", "Clase con entrenador Sebastián", true],
    ["444 Sebastián", "Cancha 3", "Clase con entrenador Sebastián", true],
    ["441 Victor", "Cancha 1", "clase con el profe victor", true],
  ];
  it.each(CASOS)("%s", (_nombre, cancha, nota, esperado) => {
    expect(pareceClase(r(cancha, nota))).toBe(esperado);
  });
});

describe("lo que la regla NO resuelve, y por eso la pantalla no bloquea", () => {
  // La clase del 23-ago de Esteban vino en cancha pelada y SIN nota: la regla
  // la llama alquiler. Por eso el modal esconde los botones pero deja la salida
  // "Me consta que sí fue una clase" — bloquear dejaría al club sin registrarla.
  it("una clase real sin nota se confunde con un alquiler", () => {
    expect(pareceClase(r("Cancha 1", null))).toBe(false);
  });

  // El monto no sirve para desempatar: se midió que un alquiler y una clase
  // real cuestan lo mismo en EasyCancha ($70.000).
  it("el monto no distingue: por eso no se usa", () => {
    expect(pareceClase(r("Cancha 2", null))).toBe(false);
    expect(pareceClase(r("Cancha 3", "Clase con entrenador Sebastián"))).toBe(true);
  });
});
