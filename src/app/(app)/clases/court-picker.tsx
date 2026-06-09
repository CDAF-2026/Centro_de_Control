"use client";

import { useRouter } from "next/navigation";

export function CourtPicker({
  tenis,
  padel,
  otras,
  selected,
  date,
  deporte,
}: {
  tenis: string[];
  padel: string[];
  otras: string[];
  selected: string;
  date: string;
  deporte: string;
}) {
  const router = useRouter();
  const dep = deporte ? `&deporte=${deporte}` : "";
  return (
    <select
      value={selected}
      onChange={(e) => {
        const c = e.target.value;
        const cq = c ? `&cancha=${encodeURIComponent(c)}` : "";
        router.push(`/clases?vista=cancha&date=${date}${cq}${dep}`);
      }}
      className="border-input bg-background h-9 max-w-60 rounded-md border px-3 text-sm"
    >
      <option value="">— Elige una cancha —</option>
      {tenis.length > 0 && (
        <optgroup label="Canchas de tenis">
          {tenis.map((c) => <option key={c} value={c}>{c}</option>)}
        </optgroup>
      )}
      {padel.length > 0 && (
        <optgroup label="Canchas de pádel">
          {padel.map((c) => <option key={c} value={c}>{c}</option>)}
        </optgroup>
      )}
      {otras.length > 0 && (
        <optgroup label="Otras">
          {otras.map((c) => <option key={c} value={c}>{c}</option>)}
        </optgroup>
      )}
    </select>
  );
}
