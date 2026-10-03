import { capitalizarNombre } from "./nombres";

/**
 * Acompañantes de una clase particular compartida (Laura, 3-oct-2026).
 *
 * La clase se reserva a nombre de UNA persona (el titular, que es a quien se le
 * cobra), pero a veces la toman 2 o 3. Al cambiar el nº de personas se piden los
 * nombres de los demás, obligatorios: el número decide el pago del profesor y,
 * sin nombres, "3 personas" no se puede comprobar después.
 *
 * Se guardan en `clases.asistentes_no_registrados` (texto, un nombre por línea):
 * es la columna que la academia usa para lo mismo —gente que vino sin estar en
 * la lista— y en la particular estaba sin uso. Texto libre y no un buscador de
 * clientes porque el profesor, que es quien más cierra, no puede leer la tabla
 * `clientes`, y el acompañante muchas veces ni está registrado.
 *
 * Sin `server-only`: lo usan el formulario, la acción y las pruebas.
 */

/** Tope de nombres que se piden; coincide con el máximo de personas de `editarValorClase`. */
export const MAX_PERSONAS = 20;

/** Lee lo guardado en la columna: un nombre por línea. */
export function leerAcompanantes(texto: string | null | undefined): string[] {
  return (texto ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Lo que se guarda en la columna (null si no hay nadie). */
export function unirAcompanantes(nombres: string[]): string | null {
  return nombres.length ? nombres.join("\n") : null;
}

/**
 * Valida los nombres enviados por el formulario para `personas` en total
 * (titular incluido). Devuelve los nombres limpios o el error para mostrar.
 *
 * `obligatorio: false` (calendario con la clase aún pendiente): guarda los que
 * vengan escritos y no reclama los que falten; el cierre los exige después.
 */
export function validarAcompanantes(
  crudos: FormDataEntryValue[],
  personas: number,
  { obligatorio = true }: { obligatorio?: boolean } = {},
): { nombres: string[] } | { error: string } {
  const faltan = Math.max(0, personas - 1);
  const nombres = crudos
    .slice(0, faltan)
    .map((v) => capitalizarNombre(String(v)));
  if (!obligatorio) return { nombres: nombres.filter(Boolean) };
  const vacios = faltan - nombres.filter((n) => n.length >= 2).length;
  if (vacios > 0) {
    return {
      error:
        faltan === 1
          ? "Escribe el nombre de la otra persona que tomó la clase."
          : `Escribe el nombre de las ${faltan} personas que acompañaron al titular (falta${vacios === 1 ? "" : "n"} ${vacios}).`,
    };
  }
  return { nombres };
}
