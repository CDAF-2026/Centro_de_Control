"use client";

import { useRouter } from "next/navigation";

/** Filtro por servicio (lista desplegable). Al elegir, aplica y vuelve a la página 1.
 *  `extra` = otros query params (p. ej. el periodo) que deben conservarse. */
export function FiltroServicio({
  servicios,
  value,
  basePath,
  extra,
}: {
  servicios: { id: number; nombre: string }[];
  value: string;
  basePath: string;
  extra?: Record<string, string>;
}) {
  const router = useRouter();
  const ir = (v: string) => {
    const p = new URLSearchParams(extra ?? {});
    if (v) p.set("servicio", v);
    const qs = p.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  };
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">Filtrar por detalle</span>
      <select
        value={value}
        onChange={(e) => ir(e.target.value)}
        className="border-input bg-background h-9 rounded-md border px-2 text-sm"
      >
        <option value="">Todos los servicios</option>
        {servicios.map((s) => (
          <option key={s.id} value={s.id}>{s.nombre}</option>
        ))}
      </select>
    </label>
  );
}
