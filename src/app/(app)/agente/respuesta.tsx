import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { FuenteVista } from "@/lib/agente/protocolo";

/**
 * Cómo se ve una respuesta del agente: el markdown que escribe el modelo (tablas,
 * negritas, listas) con los estilos de la plataforma, y debajo "Cómo lo calculé".
 *
 * `skipHtml`: el modelo no puede meter HTML propio en la pantalla, aunque lo intente.
 */

const COMPONENTES: Components = {
  p: ({ node: _n, ...p }) => <p className="mb-3 last:mb-0" {...p} />,
  ul: ({ node: _n, ...p }) => <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0" {...p} />,
  ol: ({ node: _n, ...p }) => <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0" {...p} />,
  li: ({ node: _n, ...p }) => <li className="pl-0.5" {...p} />,
  h1: ({ node: _n, ...p }) => <h3 className="font-heading mt-5 mb-2 text-sm font-semibold first:mt-0" {...p} />,
  h2: ({ node: _n, ...p }) => <h3 className="font-heading mt-5 mb-2 text-sm font-semibold first:mt-0" {...p} />,
  h3: ({ node: _n, ...p }) => <h4 className="font-heading mt-4 mb-2 text-sm font-semibold first:mt-0" {...p} />,
  strong: ({ node: _n, ...p }) => <strong className="text-foreground font-semibold" {...p} />,
  a: ({ node: _n, ...p }) => <a className="underline underline-offset-2" target="_blank" rel="noopener noreferrer" {...p} />,
  code: ({ node: _n, ...p }) => <code className="bg-muted rounded px-1 py-0.5 text-[0.85em]" {...p} />,
  blockquote: ({ node: _n, ...p }) => <blockquote className="text-muted-foreground mb-3 border-l-2 pl-3" {...p} />,
  hr: () => <hr className="border-border my-4" />,
  table: ({ node: _n, ...p }) => (
    <div className="cdaf-table-wrap my-3">
      <table className="cdaf-table tabular-nums" {...p} />
    </div>
  ),
  // `.cdaf-table` le da el espaciado a las celdas pero no a los encabezados: las
  // demás pantallas se lo ponen a cada <th> a mano.
  th: ({ node: _n, ...p }) => <th className="px-4 py-2.5" {...p} />,
};

export function Respuesta({ texto }: { texto: string }) {
  return (
    <div className="text-foreground text-sm leading-relaxed">
      <Markdown remarkPlugins={[remarkGfm]} skipHtml components={COMPONENTES}>
        {texto}
      </Markdown>
    </div>
  );
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "2026-11-01 a 2026-11-22" → "1 nov 2026 a 22 nov 2026". A mano, igual en servidor y navegador. */
export function periodoLegible(periodo: string): string {
  return periodo.replace(/(\d{4})-(\d{2})-(\d{2})/g, (_t, y, m, d) => `${Number(d)} ${MESES[Number(m) - 1]} ${y}`);
}

export function ComoLoCalcule({ fuentes }: { fuentes: FuenteVista[] }) {
  if (!fuentes.length) return null;
  return (
    <details className="text-muted-foreground mt-3 text-xs">
      <summary className="hover:text-foreground w-fit cursor-pointer select-none">Cómo lo calculé</summary>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {fuentes.map((f) => (
          <li key={`${f.fuente}|${f.periodo ?? ""}`}>
            {f.fuente}
            {f.periodo ? ` · ${periodoLegible(f.periodo)}` : ""}
          </li>
        ))}
      </ul>
    </details>
  );
}
