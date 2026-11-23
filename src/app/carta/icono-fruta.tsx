import { sinTildes } from "@/lib/cafeteria/buscar";

/**
 * Un dibujo pequeño de la fruta junto a cada sabor de un producto con opciones
 * (los jugos naturales: Mango, Mora, Fresa, Guanábana, Maracuyá). Pedido de
 * Laura, 20-nov-2026.
 *
 * Las opciones son texto libre que la cafetería escribe en el panel, así que el
 * dibujo se escoge por el NOMBRE: si la opción trae la palabra de una fruta que
 * está aquí ("Mango", "mango biche"), sale su dibujo; si no ("Frío", "Lulo"),
 * no sale nada y el renglón queda igual de alineado. Para una fruta nueva hay
 * que agregar su dibujo a `FRUTAS`.
 *
 * Dibujos hechos a mano en un lienzo de 48 × 48, planos y a dos tonos, para que
 * se lean en 40 px y también en los 24 px de la vista previa del panel.
 */

/** Las semillas del maracuyá, en rueda: ángulo en grados desde la derecha. */
const SEMILLAS = [0, 45, 90, 135, 180, 225, 270, 315].map((angulo) => {
  const rad = (angulo * Math.PI) / 180;
  return { x: 24 + 7.5 * Math.cos(rad), y: 25 + 7.5 * Math.sin(rad), giro: angulo - 90 };
});

/** Los granitos de la mora: centro de cada uno, y si va en el tono claro. */
const GRANOS: [number, number, boolean][] = [
  [24, 17.5, false],
  [18.5, 20, true],
  [29.5, 20, true],
  [14.5, 26.5, false],
  [24, 25.5, false],
  [33.5, 26.5, false],
  [19, 32.5, true],
  [29, 32.5, true],
  [24, 39, false],
];

const PEPITAS_FRESA: [number, number][] = [
  [17, 23], [24, 22], [31, 23], [14, 29], [20.5, 29], [27.5, 29], [34, 29], [18, 35], [24, 35.5], [30, 35], [24, 40.5],
];

const PUAS_GUANABANA: [number, number][] = [
  [20, 14], [27, 13.5], [33, 17.5], [17, 20.5], [24, 20], [30.5, 23], [36, 25.5], [14.5, 27.5],
  [21, 27], [27.5, 29.5], [34, 32], [17.5, 34], [24, 35], [30, 37.5], [22, 40],
];

const FRUTAS: Record<string, React.ReactNode> = {
  mango: (
    <>
      <path d="M12 32C7 23 11 11 23 8c11-2.5 19 5 17.5 15.5C39 34 30.5 41.5 21.5 40 17 39.3 14 36 12 32z" fill="#fbb62c" />
      <path d="M12 32C7 23 11 11 23 8c-5.5 5-7.5 13-5.5 21 1 4.5 3 8.5 6 11.2-5 .1-9.3-3.4-11.5-8.2z" fill="#f4802f" />
      <path d="M30 13.5c3.5 1 6 4 6.5 7.5" fill="none" stroke="#fff" strokeOpacity=".6" strokeWidth="2" strokeLinecap="round" />
      <path d="M23 8.5C23.5 6 25 4.5 27.5 4" fill="none" stroke="#6d4c2f" strokeWidth="2" strokeLinecap="round" />
      <path d="M27 4.5c3.5-3 9-2.5 12 1-3.5 3-9 2.5-12-1z" fill="#4caf50" />
    </>
  ),
  mora: (
    <>
      {GRANOS.map(([x, y, claro]) => (
        <g key={`${x}-${y}`}>
          <circle cx={x} cy={y} r="5.6" fill={claro ? "#6b3fa0" : "#4a1f6e"} />
          <circle cx={x - 1.8} cy={y - 1.8} r="1.3" fill="#fff" fillOpacity=".45" />
        </g>
      ))}
      <path d="M24 4v5" fill="none" stroke="#2e7d32" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M24 8.5l2.6 3.3 4.9-1.3-2.9 4.5h-9.2l-2.9-4.5 4.9 1.3z" fill="#43a047" />
    </>
  ),
  fresa: (
    <>
      <path d="M24 44C14.5 40 8.5 31 8.5 23c0-5.5 5.5-8.5 15.5-8.5s15.5 3 15.5 8.5c0 8-6 17-15.5 21z" fill="#e53935" />
      <path d="M24 44c9.5-4 15.5-13 15.5-21 0-2.5-1.2-4.5-3.5-5.8C37 26 33 36 24 44z" fill="#c62828" />
      {PEPITAS_FRESA.map(([x, y]) => (
        <ellipse key={`${x}-${y}`} cx={x} cy={y} rx="1.1" ry="1.7" fill="#ffe082" />
      ))}
      <path d="M24 16c-4-6.5-10.5-7-14-4.5 4 1 7 3.5 8 7zM24 16c4-6.5 10.5-7 14-4.5-4 1-7 3.5-8 7z" fill="#43a047" />
      <path d="M24 18c-3-4.5-2-9.5 0-13 2 3.5 3 8.5 0 13z" fill="#2e7d32" />
    </>
  ),
  guanabana: (
    <>
      <path d="M24 6.5c9 0 16.5 7 16.5 17.5 0 10-7.5 19.5-15.5 19.5-8.5 0-17.5-8-17.5-19 0-10.5 7.5-18 16.5-18z" fill="#8bc34a" />
      <path d="M24 6.5c-9 0-16.5 7.5-16.5 18 0 11 9 19 17.5 19-7.5-4.5-11.5-12-11.5-20 0-7.5 4-14 10.5-17z" fill="#689f38" />
      {PUAS_GUANABANA.map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="1.1" fill="#33691e" />
      ))}
      <path d="M24 7c0-2 1-3.5 2.5-4" fill="none" stroke="#5d4037" strokeWidth="2.2" strokeLinecap="round" />
    </>
  ),
  // Partido por la mitad, que es como se reconoce: cáscara amarilla y pulpa con semillas.
  maracuya: (
    <>
      <circle cx="24" cy="25" r="17.5" fill="#f9c80e" />
      <circle cx="24" cy="25" r="14.8" fill="#fff4c2" />
      <circle cx="24" cy="25" r="12.3" fill="#ffb000" />
      {SEMILLAS.map((s) => (
        <g key={s.giro} transform={`rotate(${s.giro} ${s.x} ${s.y})`}>
          <ellipse cx={s.x} cy={s.y} rx="2.6" ry="3.4" fill="#ffd54f" />
          <ellipse cx={s.x} cy={s.y} rx="1.4" ry="2.2" fill="#3a2418" />
        </g>
      ))}
    </>
  ),
};

/** La fruta que nombra una opción ("Mango", "Jugo de mora") o `null` si no hay dibujo para ella. */
export function frutaDe(opcion: string): string | null {
  const palabras = sinTildes(opcion).split(/[^a-z]+/);
  return Object.keys(FRUTAS).find((fruta) => palabras.includes(fruta)) ?? null;
}

export function IconoFruta({ opcion, className }: { opcion: string; className?: string }) {
  const fruta = frutaDe(opcion);
  if (!fruta) return null;
  return (
    <svg data-fruta={fruta} viewBox="0 0 48 48" aria-hidden className={className}>
      {FRUTAS[fruta]}
    </svg>
  );
}
