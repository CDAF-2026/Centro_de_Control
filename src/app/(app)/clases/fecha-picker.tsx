"use client";

import { useRouter } from "next/navigation";

/**
 * Salta a una fecha concreta sin avanzar día por día con las flechas.
 *
 * Usa `<input type="date">` nativo a propósito: el navegador despliega su
 * propio calendario (y en móvil el selector del sistema), sin traernos una
 * librería de calendario para un solo campo.
 *
 * Desde la vista Mes se abre la vista DÍA de la fecha elegida, que es lo mismo
 * que ya hace el clic sobre el número del día; desde Día/Profesor/Cancha se
 * conserva la vista y solo cambia el día.
 */
export function FechaPicker({
  vista,
  date,
  deporte,
  profesor,
  cancha,
}: {
  vista: "mes" | "dia" | "profesor" | "cancha";
  date: string;
  deporte: string;
  profesor: string;
  cancha: string;
}) {
  const router = useRouter();
  const destino = vista === "mes" ? "dia" : vista;

  return (
    <label className="text-muted-foreground flex items-center gap-2 text-sm">
      Ir a
      <input
        type="date"
        aria-label="Ir a una fecha"
        value={date}
        onChange={(e) => {
          const d = e.target.value;
          if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
          const extra =
            destino === "profesor" && profesor
              ? `&profesor=${encodeURIComponent(profesor)}`
              : destino === "cancha" && cancha
                ? `&cancha=${encodeURIComponent(cancha)}`
                : "";
          const dep = deporte ? `&deporte=${deporte}` : "";
          router.push(`/clases?vista=${destino}&date=${d}${extra}${dep}`);
        }}
        className="border-input bg-background h-9 rounded-md border px-3 text-sm tabular-nums"
      />
    </label>
  );
}
