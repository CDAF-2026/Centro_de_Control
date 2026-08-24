"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { datosDelNino, inscribirEnGrupo, type NinoInfo } from "../../actions";
import { MiembroAutocomplete } from "@/components/miembro-autocomplete";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DIA_CORTO, NIVEL_LABEL } from "../../ocupacion";

export type FranjaOpcion = {
  id: number;
  dia: number;
  hora: string;
  horaFin: string;
  profesor: string | null;
  cancha: string | null;
  cupo: number;
  usados: number;
};

export type GrupoOpcion = {
  id: number;
  nombre: string;
  nivel: string;
  edadMin: number;
  edadMax: number;
  franjas: FranjaOpcion[];
};

function Paso({ n, titulo, nota }: { n: number; titulo: string; nota?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="bg-stadium font-heading inline-flex size-5 items-center justify-center rounded-full text-[11px] font-bold text-white">
        {n}
      </span>
      <span className="text-sm font-semibold">{titulo}</span>
      {nota && <span className="text-muted-foreground text-xs">— {nota}</span>}
    </div>
  );
}

export function InscribirGrupoForm({
  academiaId,
  academiaNombre,
  grupos,
  grupoInicial,
}: {
  academiaId: number;
  academiaNombre: string;
  grupos: GrupoOpcion[];
  grupoInicial: number | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [nino, setNino] = useState<(NinoInfo & { miembroId: number }) | null>(null);
  const [grupoId, setGrupoId] = useState<number | null>(grupoInicial);
  const [franjaIds, setFranjaIds] = useState<number[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const grupo = grupos.find((g) => g.id === grupoId) ?? null;

  // Los grupos se ordenan por lo que le sirve a la edad del niño: primero los que
  // le calzan, después el resto. No se esconde ninguno — el club a veces mete a un
  // niño fuera de rango a propósito, y esconderlo lo obligaría a adivinar.
  const encaja = (g: GrupoOpcion) => nino?.edad != null && nino.edad >= g.edadMin && nino.edad <= g.edadMax;
  const ordenados = nino?.edad == null ? grupos : [...grupos].sort((a, b) => Number(encaja(b)) - Number(encaja(a)));

  function elegirNino(sel: { miembroId: number; clienteId: number } | null) {
    setErr(null);
    if (!sel) { setNino(null); return; }
    start(async () => {
      const d = await datosDelNino(sel.miembroId);
      if (d) setNino({ ...d, miembroId: sel.miembroId });
    });
  }

  function alternarFranja(id: number) {
    setFranjaIds((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));
  }

  function confirmar() {
    setErr(null);
    start(async () => {
      const r = await inscribirEnGrupo({
        academiaId,
        grupoId: grupoId!,
        miembroId: nino!.miembroId,
        franjaIds,
      });
      if (r.error) setErr(r.error);
      else {
        setOk(r.ok ?? "Listo.");
        router.push(`/academias/${academiaId}/grupos/${grupoId}`);
      }
    });
  }

  if (ok) {
    return <p className="border-lime/50 bg-lime/10 rounded-xl border px-4 py-3 text-sm">✓ {ok}</p>;
  }

  const elegidas = grupo?.franjas.filter((f) => franjaIds.includes(f.id)) ?? [];

  return (
    <div className="ring-foreground/[0.06] bg-card space-y-6 rounded-2xl p-6 shadow-md ring-1">
      <p className="cdaf-eyebrow text-muted-foreground text-[11px]">{academiaNombre}</p>

      {/* 1 · quién */}
      <div className="space-y-2">
        <Paso n={1} titulo="¿Quién es el niño?" />
        {nino ? (
          <div className="border-lime/50 bg-lime/10 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3">
            <div>
              <p className="text-sm font-semibold">{nino.nombre}</p>
              <p className="text-muted-foreground mt-0.5 text-xs">
                {nino.edad != null ? `${nino.edad} años` : "sin fecha de nacimiento"}
              </p>
            </div>
            <button type="button" onClick={() => setNino(null)} className="text-xs underline">Cambiar</button>
          </div>
        ) : (
          <MiembroAutocomplete onSelect={elegirNino} />
        )}
      </div>

      {/* 2 · grupo */}
      {nino && (
        <div className="space-y-2.5">
          <Paso
            n={2}
            titulo="¿A qué grupo entra?"
            nota={nino.edad != null ? `ordenados por lo que le sirve a un niño de ${nino.edad} años` : undefined}
          />
          <div className="space-y-2">
            {ordenados.map((g) => {
              const sel = g.id === grupoId;
              const libres = g.franjas.filter((f) => f.usados < f.cupo).length;
              const fuera = nino.edad != null && !encaja(g);
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => { setGrupoId(g.id); setFranjaIds([]); }}
                  className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                    sel ? "border-lime bg-lime/10" : "border-border hover:bg-muted/50"
                  }`}
                >
                  <span className={`size-4 shrink-0 rounded-full border-2 ${sel ? "border-[#5b6300] bg-lime" : "border-input"}`} />
                  <span className="min-w-0 flex-grow">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold">{g.nombre}</span>
                      <Badge variant="secondary">
                        {NIVEL_LABEL[g.nivel] ?? g.nivel} · {g.edadMin}–{g.edadMax} años
                      </Badge>
                      {fuera && <Badge variant="warning">fuera del rango de edad</Badge>}
                    </span>
                    <span className="text-muted-foreground mt-1 block text-xs">
                      {libres} de {g.franjas.length} {g.franjas.length === 1 ? "franja" : "franjas"} con cupo
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 3 · días */}
      {grupo && (
        <div className="space-y-2.5">
          <Paso n={3} titulo="¿Qué días viene?" nota={`franjas de ${grupo.nombre}`} />
          {grupo.franjas.length === 0 ? (
            <p className="text-muted-foreground rounded-xl border border-dashed p-4 text-center text-sm">
              Este grupo no tiene franjas todavía.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {grupo.franjas.map((f) => {
                const marcada = franjaIds.includes(f.id);
                const llena = f.usados >= f.cupo;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => alternarFranja(f.id)}
                    className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                      marcada ? "border-lime bg-lime/10" : "border-border hover:bg-muted/50"
                    }`}
                  >
                    <span className={`flex size-4 shrink-0 items-center justify-center rounded border-2 ${marcada ? "border-[#5b6300] bg-lime" : "border-input"}`}>
                      {marcada && (
                        <svg viewBox="0 0 24 24" className="size-2.5" fill="none" stroke="#1a1c1e" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      )}
                    </span>
                    <span className="min-w-0 flex-grow">
                      <span className="font-heading block text-sm font-semibold tabular-nums">
                        {DIA_CORTO[f.dia]} {f.hora}–{f.horaFin}
                      </span>
                      <span className="text-muted-foreground block text-[11px]">
                        {f.profesor ?? "sin profesor"}
                        {f.cancha ? ` · cancha ${f.cancha}` : ""}
                      </span>
                    </span>
                    <span className={`shrink-0 text-[11px] tabular-nums ${llena ? "text-[#8a5600]" : "text-muted-foreground"}`}>
                      {llena ? `llena · ${f.usados}/${f.cupo}` : `${f.cupo - f.usados} libres`}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {err && <p className="text-destructive text-sm">{err}</p>}

      {/* resumen + acción */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-t pt-4">
        <p className="text-muted-foreground text-sm">
          {nino && grupo && elegidas.length > 0 ? (
            <>
              {nino.nombre.split(",")[1]?.trim() ?? nino.nombre} entra a{" "}
              <strong className="text-foreground">{grupo.nombre}</strong> y viene{" "}
              <strong className="text-foreground">
                {elegidas.length} {elegidas.length === 1 ? "vez" : "veces"} por semana
              </strong>
              : {elegidas.map((f) => `${DIA_CORTO[f.dia].toLowerCase()} ${f.hora}`).join(", ")}.
            </>
          ) : (
            "Escoge el niño, su grupo y los días."
          )}
        </p>
        <div className="flex shrink-0 gap-2">
          <Button type="button" variant="outline" onClick={() => router.push(`/academias/${academiaId}`)}>
            Cancelar
          </Button>
          <Button type="button" onClick={confirmar} disabled={pending || !nino || !grupo || elegidas.length === 0}>
            {pending ? "Inscribiendo…" : "Inscribir"}
          </Button>
        </div>
      </div>
    </div>
  );
}
