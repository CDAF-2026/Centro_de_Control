import type { OpcionProfesor } from "@/lib/staff";

export type CalEvento = {
  id: string;
  dia: number;
  fecha: string; // YYYY-MM-DD
  hora: string; // HH:mm (inicio)
  horaFin: string; // HH:mm (fin; "" si no hay)
  cancha: string | null;
  courtKey: string; // cancha física normalizada por deporte (ej. "padel#3") para la vista por cancha
  courtLabel: string; // etiqueta legible (ej. "Cancha 3")
  profesor: string | null;
  deporte: "tenis" | "padel" | null;
  fuente: "interna" | "easycancha";
  esAcademia: boolean;
  cancelada: boolean;
  chip: string; // etiqueta corta en la celda
  titulo: string; // título del modal
  subtitulo: string; // subtítulo del modal
  estadoLabel: string;
  estadoTone: "ok" | "warn" | "bad";
  detalles: [string, string][];
  /**
   * Solo en clases PARTICULARES ya registradas (individual sin paquete): permite
   * corregir el valor cobrado desde el modal. Las de paquete sacan su valor del
   * paquete y la academia no tiene valor por clase, así que no lo llevan.
   */
  particular?: {
    claseId: number;
    /** Lo que hoy se cobra: el corregido si existe, si no el original. */
    valor: number;
    /**
     * Cuántas personas tomaron la clase. Decide el escalón de pago del profesor
     * (`escalonado_asistentes` en liquidacion.ts), así que un 1 por defecto
     * donde vinieron 2 le paga de menos.
     */
    personas: number;
    /** Si este usuario puede corregirla AHORA (24 h desde el inicio; el SA siempre). */
    editable: boolean;
    /** Por qué está bloqueada, o la advertencia a mostrar. null = sin nota. */
    aviso: string | null;
  };
  /**
   * Cómo se cobra una clase individual YA REGISTRADA — y con qué cambiarlo.
   *
   * Existe por dos cosas que salieron el 15-sep-2026 con la clase de Karent
   * Coronado (16-sep, tras arreglarle la ficha):
   *  · **No se veía.** El subtítulo decía "Clase individual" en TODAS las que no
   *    son de academia, así que una clase de paquete y una particular se leían
   *    igual. La de Karent ya estaba bien atada a su paquete y la pantalla la
   *    mostraba como individual: el dato era correcto y la pantalla mentía.
   *  · **No se podía cambiar.** Registrar mal (particular donde iba paquete) no
   *    tenía arreglo: había que borrar la clase y volverla a crear.
   *
   * Ausente = academia, cancelada, o quien mira no puede editar clases.
   */
  cobro?: {
    claseId: number;
    /** Cómo se cobra HOY. */
    modo: "paquete" | "particular";
    /** Nombre y saldo del paquete al que está atada. null si es particular. */
    paqueteLabel: string | null;
    /** Lo que se cobró como particular; se propone si se vuelve a particular. */
    valor: number;
    /** Si este usuario puede cambiarlo AHORA (24 h desde el inicio; el SA siempre). */
    editable: boolean;
    /** Por qué está bloqueado, o la advertencia a mostrar. null = sin nota. */
    aviso: string | null;
    /**
     * Cerrada = el cambio MUEVE saldo de paquete, no solo la etiqueta: el
     * descuento ocurre al cerrar (`cerrarClase` → `paquete_consumir`), así que
     * una clase todavía programada no ha consumido nada.
     */
    cerrada: boolean;
  };
  /**
   * Solo en clases YA REGISTRADAS que se quedaron sin profesor: deja asignarlo
   * desde el modal. El club crea reservas sin profesor en EasyCancha (el profe
   * es nuevo, o se les olvida) y esa clase desaparece de la liquidación en
   * silencio, porque `liquidacion.ts` salta las que no tienen profesor.
   * Ausente = la clase ya tiene profesor y no se toca desde aquí.
   */
  sinProfesor?: {
    claseId: number;
    /** Profesores del deporte de la clase + los que no tengan deporte marcado. */
    opciones: OpcionProfesor[];
  };
  /** Datos de la reserva EasyCancha (solo eventos no materializados) para registrarla. */
  ec?: {
    bookingId: string;
    email: string;
    nombres: string;
    apellidos: string;
    telefono: string;
    /**
     * Cédula del cliente según EasyCancha. Es el SEGUNDO camino para encontrar
     * su ficha cuando el correo no casa — el caso de Karent Coronado, cuya
     * ficha se partió en dos por una letra de más en el correo.
     */
    documento: string;
    profesorMatched: string | null;
    /** Reserva del usuario "BLOQUEOS ACADEMIAS" = cancha que el club se auto-reserva. */
    esBloqueo: boolean;
    /**
     * false = parece un ALQUILER de cancha, no una clase (ver `pareceClase` en
     * easycancha/client.ts). El modal entonces no ofrece "A un paquete /
     * Particular": convertir un alquiler en clase fue justo el error del
     * 15-sep-2026, que dejó 5 alquileres metidos en la cola de cierre.
     */
    pareceClase: boolean;
    /** Nota de EasyCancha; solo se propaga en los bloqueos (en las de clientes es privada). */
    comentario: string;
    /**
     * Lo que EasyCancha dice que vale la reserva. Se usa para PRE-LLENAR el
     * precio al registrarla: el club cobra por personas (1 persona $130.000,
     * 2 personas $150.000) y EasyCancha solo conoce la tarifa de la reserva, así
     * que la cifra es un punto de partida que se corrige, no un dato firme.
     */
    monto: number | null;
  };
};

/** "15:30" → 930 minutos. Devuelve null si no parsea. */
export function aMinutos(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** 930 → "15:30". */
export function aHora(min: number): string {
  const h = Math.floor(min / 60), m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Parte un bloqueo de EasyCancha en las franjas que se van a registrar como clases.
 * `duracionMin <= 0` (o mayor que el bloque) = el bloque entero como UNA sola clase.
 * Si al final sobra un pedazo, sale como una franja más corta: así no se pierde
 * tiempo del bloque y la vista previa lo deja ver antes de confirmar.
 */
export function franjasDeBloque(
  horaInicio: string,
  horaFin: string,
  duracionMin: number,
): { inicio: string; fin: string }[] {
  const ini = aMinutos(horaInicio);
  const fin = aMinutos(horaFin);
  if (ini === null || fin === null || fin <= ini) {
    return [{ inicio: horaInicio, fin: horaFin }];
  }
  if (duracionMin <= 0 || duracionMin >= fin - ini) {
    return [{ inicio: aHora(ini), fin: aHora(fin) }];
  }
  const out: { inicio: string; fin: string }[] = [];
  for (let t = ini; t < fin; t += duracionMin) {
    out.push({ inicio: aHora(t), fin: aHora(Math.min(t + duracionMin, fin)) });
  }
  return out;
}

/** Color de fondo del chip: academia tiene su propio color; el resto, por deporte. */
export function eventoBg(ev: { deporte: "tenis" | "padel" | null; esAcademia?: boolean }) {
  if (ev.esAcademia) return "bg-[#8b7cf6]/20";
  return ev.deporte === "tenis" ? "bg-chart-3/20" : ev.deporte === "padel" ? "bg-lime/30" : "bg-muted";
}

/** Color del punto/indicador: academia tiene su propio color; el resto, por deporte. */
export function eventoDot(ev: { deporte: "tenis" | "padel" | null; esAcademia?: boolean }) {
  if (ev.esAcademia) return "bg-[#8b7cf6]";
  return ev.deporte === "tenis" ? "bg-chart-3" : ev.deporte === "padel" ? "bg-lime" : "bg-muted-foreground";
}

/** Normaliza el nombre de cancha de EasyCancha a la cancha física (Cancha N) por deporte.
 *  Ej: "Profesor Leo Ruíz Cancha 3" (padel) → { key: "padel#3", label: "Cancha 3" }.
 *  Las canchas de tenis y de pádel con el mismo número son distintas → la clave incluye el deporte. */
export function courtInfo(cancha: string | null, deporte: "tenis" | "padel" | null): { key: string; label: string } {
  const m = (cancha ?? "").match(/cancha\s*(\d+)/i);
  if (m) return { key: `${deporte ?? "otra"}#${m[1]}`, label: `Cancha ${m[1]}` };
  const name = (cancha ?? "").trim();
  return name ? { key: `otra#${name.toLowerCase()}`, label: name } : { key: "", label: "Sin cancha" };
}
