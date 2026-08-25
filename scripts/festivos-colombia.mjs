/**
 * Festivos de Colombia. 18 al año:
 *  · 6 fijos
 *  · 7 que la Ley Emiliani corre al lunes siguiente
 *  · 2 de Semana Santa que NO se mueven (jueves y viernes santo)
 *  · 3 atados a Pascua que ya caen en lunes por la Emiliani (+43, +64, +71)
 */
const d = (y, m, day) => new Date(Date.UTC(y, m - 1, day));
const iso = (x) => x.toISOString().slice(0, 10);
const add = (x, n) => new Date(x.getTime() + n * 86400000);
// Corre al lunes siguiente (si ya es lunes, se queda).
const lunes = (x) => { const dow = x.getUTCDay(); return dow === 1 ? x : add(x, (8 - dow) % 7); };

/** Domingo de Pascua (algoritmo gregoriano anónimo). */
function pascua(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100;
  const dd = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - dd - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return d(y, mes, dia);
}

function festivos(y) {
  const p = pascua(y);
  const out = [
    [d(y, 1, 1),   "Año Nuevo"],
    [d(y, 5, 1),   "Día del Trabajo"],
    [d(y, 7, 20),  "Independencia"],
    [d(y, 8, 7),   "Batalla de Boyacá"],
    [d(y, 12, 8),  "Inmaculada Concepción"],
    [d(y, 12, 25), "Navidad"],
    [lunes(d(y, 1, 6)),   "Reyes Magos"],
    [lunes(d(y, 3, 19)),  "San José"],
    [lunes(d(y, 6, 29)),  "San Pedro y San Pablo"],
    [lunes(d(y, 8, 15)),  "Asunción de la Virgen"],
    [lunes(d(y, 10, 12)), "Día de la Raza"],
    [lunes(d(y, 11, 1)),  "Todos los Santos"],
    [lunes(d(y, 11, 11)), "Independencia de Cartagena"],
    [add(p, -3), "Jueves Santo"],
    [add(p, -2), "Viernes Santo"],
    [add(p, 43), "Ascensión del Señor"],
    [add(p, 64), "Corpus Christi"],
    [add(p, 71), "Sagrado Corazón"],
  ];
  return out.map(([f, n]) => [iso(f), n]).sort();
}

const DOW = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

/**
 * Dos festivos pueden caer el MISMO día y entonces el año tiene 17, no 18.
 * Pasa en 2030: el 29 de junio es sábado, así que San Pedro se corre al lunes
 * 1 de julio, que es justo donde cae el Sagrado Corazón (Pascua + 71). Sin esta
 * fusión la migración revienta con "duplicate key value violates festivo_pkey".
 */
function fusionar(lista) {
  const porFecha = new Map();
  for (const [f, n] of lista) {
    porFecha.set(f, porFecha.has(f) ? `${porFecha.get(f)} y ${n}` : n);
  }
  return [...porFecha.entries()].sort();
}

const filas = [];
for (let y = 2026; y <= 2032; y++) {
  const fs = fusionar(festivos(y));
  if (fs.length < 17 || fs.length > 18) throw new Error(`${y} tiene ${fs.length} festivos`);
  if (process.argv.includes("--check") && y <= 2027) {
    console.log(`\n${y} · Pascua ${iso(pascua(y))}`);
    for (const [f, n] of fs) console.log(`  ${f} ${DOW[new Date(f + "T00:00:00Z").getUTCDay()]}  ${n}`);
  }
  for (const [f, n] of fs) filas.push(`  ('${f}', '${n.replace(/'/g, "''")}')`);
}
if (!process.argv.includes("--check")) console.log(filas.join(",\n"));
