"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronDown, ChevronUp, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { partirCapitulo, type Reglamento } from "@/lib/registro/reglamento";

const CARD = "bg-card rounded-2xl shadow-sm ring-1 ring-foreground/[0.06]";

/** Capítulos como tarjetas; cada artículo se pliega. Misma gramática visual que el consentimiento. */
export function ReglamentoVista({ titulo, codigo, vigenteDesde, reglamento }: { titulo: string; codigo: string; vigenteDesde: string | null; reglamento: Reglamento }) {
  const [abiertos, setAbiertos] = useState<string[]>([]);
  const todas = reglamento.capitulos.flatMap((c, ci) => c.articulos.map((_, ai) => `${ci}-${ai}`));
  const todasAbiertas = abiertos.length === todas.length && todas.length > 0;
  const alternar = (k: string) => setAbiertos((a) => (a.includes(k) ? a.filter((x) => x !== k) : [...a, k]));

  return (
    <>
      <section className={cn(CARD, "space-y-3 p-5")}>
        <div className="flex items-center gap-3">
          <Link href="/registro" className="size-11 shrink-0 overflow-hidden rounded-xl bg-primary">
            <Image src="/registro-logo.jpg" alt="Centro Deportivo Alejandro Falla" width={44} height={44} className="size-full object-cover" />
          </Link>
          <div className="min-w-0">
            <p className="cdaf-eyebrow text-[11px] text-[#46530a]">Centro Deportivo Alejandro Falla</p>
            <h1 className="font-heading text-[19px] font-extrabold leading-tight tracking-tight">Reglamento General</h1>
          </div>
        </div>
        {reglamento.preambulo.map((p, i) => (
          <p key={i} className="text-sm leading-relaxed">{p}</p>
        ))}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <span className="text-muted-foreground text-xs">Versión {codigo}{vigenteDesde ? ` · vigente desde ${vigenteDesde}` : ""}</span>
          <div className="flex items-center gap-4">
            <button type="button" onClick={() => setAbiertos(todasAbiertas ? [] : todas)} className="text-[#46530a] text-[13px] font-semibold hover:underline">
              {todasAbiertas ? "Cerrar todo" : "Abrir todo"}
            </button>
            <a href="/registro/reglamento/pdf" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-stadium px-3 text-[13px] font-semibold text-primary">
              <Download className="size-4" /> PDF
            </a>
          </div>
        </div>
      </section>

      {reglamento.capitulos.map((cap, ci) => {
        const { numero, nombre } = partirCapitulo(cap.titulo);
        return (
          <section key={ci} className={cn(CARD, "overflow-hidden")}>
            <div className="space-y-2 px-5 pb-4 pt-5">
              <p className="cdaf-eyebrow text-muted-foreground text-[11px]">{numero ? `Capítulo ${numero}` : "Capítulo"}</p>
              <h2 className="font-heading text-[17px] font-extrabold leading-tight tracking-tight">{nombre}</h2>
              {cap.intro.map((p, i) => (
                <p key={i} className="text-muted-foreground text-sm leading-relaxed">{p}</p>
              ))}
            </div>
            {cap.articulos.map((art, ai) => {
              const k = `${ci}-${ai}`;
              const abierto = abiertos.includes(k);
              return (
                <div key={k} className={cn("border-t transition-colors", abierto && "bg-primary/10 border-l-4 border-l-primary")}>
                  <button type="button" aria-expanded={abierto} aria-controls={`art-${k}`} onClick={() => alternar(k)}
                    className={cn("flex w-full items-center justify-between gap-3 py-3.5 pr-5 text-left text-sm font-bold", abierto ? "pl-4" : "pl-5")}>
                    <span>{art.titulo}</span>
                    {abierto ? <ChevronUp className="size-[18px] shrink-0" /> : <ChevronDown className="text-muted-foreground size-[18px] shrink-0" />}
                  </button>
                  <div id={`art-${k}`} hidden={!abierto} className="space-y-2 pb-4 pl-5 pr-5">
                    {art.parrafos.map((p, i) => (
                      <p key={i} className="text-sm leading-relaxed">{p}</p>
                    ))}
                  </div>
                </div>
              );
            })}
          </section>
        );
      })}
      <p className="text-muted-foreground px-2 pb-6 text-center text-xs">{titulo}</p>
    </>
  );
}
