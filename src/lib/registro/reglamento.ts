/**
 * El Reglamento General del club (opción A, Laura, 8-oct-2026): se guarda en
 * `consentimiento_version` con `publico = 'reglamento'`, como texto con marcas de estructura
 * ("# " = capítulo · "## " = artículo · el resto, párrafos separados por línea en blanco), y
 * aquí se convierte en capítulos y artículos para pintarlo por partes y para el PDF.
 * Lógica pura, con pruebas; sin `server-only` porque la usa un componente de cliente.
 */
export type Articulo = { titulo: string; parrafos: string[] };
export type Capitulo = { titulo: string; intro: string[]; articulos: Articulo[] };
export type Reglamento = { preambulo: string[]; capitulos: Capitulo[] };

export function parsearReglamento(texto: string): Reglamento {
  const bloques = texto.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const out: Reglamento = { preambulo: [], capitulos: [] };
  let cap: Capitulo | null = null;
  let art: Articulo | null = null;
  for (const b of bloques) {
    if (b.startsWith("# ")) {
      cap = { titulo: b.slice(2).trim(), intro: [], articulos: [] };
      art = null;
      out.capitulos.push(cap);
    } else if (b.startsWith("## ")) {
      if (!cap) { cap = { titulo: "", intro: [], articulos: [] }; out.capitulos.push(cap); }
      art = { titulo: b.slice(3).trim(), parrafos: [] };
      cap.articulos.push(art);
    } else if (art) art.parrafos.push(b);
    else if (cap) cap.intro.push(b);
    else out.preambulo.push(b);
  }
  return out;
}

/**
 * "CAPÍTULO 3: ACADEMIAS DE TENIS Y PÁDEL" → { tipo: "Capítulo", numero: "3", nombre: "Academias de tenis y pádel" }.
 * "ANEXO 1 – DECLARACIÓN DE…" → { tipo: "Anexo", numero: "1", … } (Reglamento General de oct-2026).
 * Un título vacío (el Reglamento de Academias no tiene capítulos) → todo vacío.
 */
export function partirCapitulo(titulo: string): { tipo: "Capítulo" | "Anexo" | ""; numero: string; nombre: string } {
  const m = titulo.match(/^(CAP[ÍI]TULO|ANEXO)\s+(\d+)\s*[:.–-]?\s*(.*)$/i);
  if (!m) return { tipo: "", numero: "", nombre: titulo };
  const nombre = m[3].trim().toLocaleLowerCase("es").replace(/^\p{L}/u, (c) => c.toLocaleUpperCase("es"));
  return { tipo: /^anexo/i.test(m[1]) ? "Anexo" : "Capítulo", numero: m[2], nombre };
}
