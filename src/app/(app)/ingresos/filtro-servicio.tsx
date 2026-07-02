"use client";

import { useRouter } from "next/navigation";

/** Filtro por servicio (lista desplegable). Al elegir, aplica y vuelve a la página 1. */
export function FiltroServicio({
  servicios,
  value,
  basePath,
}: {
  servicios: { id: number; nombre: string }[];
  value: string;
  basePath: string;
}) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">Filtrar por detalle</span>
      <select
        value={value}
        onChange={(e) => router.push(e.target.value ? `${basePath}?servicio=${e.target.value}` : basePath)}
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
