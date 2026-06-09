"use client";

import { useRouter } from "next/navigation";

export function ProfesorPicker({
  professors,
  selected,
  year,
  month,
  deporte,
}: {
  professors: string[];
  selected: string;
  year: number;
  month: number;
  deporte: string;
}) {
  const router = useRouter();
  const dep = deporte ? `&deporte=${deporte}` : "";
  return (
    <select
      value={selected}
      onChange={(e) => {
        const p = e.target.value;
        const pq = p ? `&profesor=${encodeURIComponent(p)}` : "";
        router.push(`/clases?vista=profesor&year=${year}&month=${month}${pq}${dep}`);
      }}
      className="border-input bg-background h-9 max-w-60 rounded-md border px-3 text-sm"
    >
      <option value="">— Elige un profesor —</option>
      {professors.map((p) => (
        <option key={p} value={p}>{p}</option>
      ))}
    </select>
  );
}
