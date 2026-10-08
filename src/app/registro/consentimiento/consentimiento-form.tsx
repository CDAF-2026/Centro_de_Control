"use client";

import { startTransition, useActionState, useCallback, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, ChevronUp, ListChecks } from "lucide-react";
import { firmarConsentimiento, type ConsentimientoState } from "./actions";
import { FirmaPad } from "./firma-pad";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { edadDesde } from "@/lib/validations/cliente";
import { resumenDelConsentimiento, titulosDelTexto } from "@/lib/registro/texto";
import { TIPOS_DOCUMENTO, RH_VALORES, tipoDocumentoPorEdad } from "@/app/(app)/clientes/documento";

export type TextoConsentimiento = { codigo: string; titulo: string; parrafos: string[] };

/** Un dato de la sesión del recorrido: viene de "Actualizar datos" (Fase 3) y evita volver a pedirlo. */
export type Precargado = {
  menor?: { nombres: string; apellidos: string; documento: string; tipoDocumento: string; fechaNacimiento: string; eps: string; rh: string; confirmado?: boolean };
  firmante?: { nombre: string; documento: string; parentesco?: string; celular?: string; email?: string };
};

const INPUT = "h-12 rounded-[10px] border-[1.5px] px-3.5 text-[15px] md:text-[15px]";
const SEL = "border-input bg-card h-12 w-full appearance-none rounded-[10px] border-[1.5px] px-3.5 pr-9 text-[15px] disabled:opacity-70";
const CARD = "bg-card rounded-2xl shadow-[0_1px_2px_rgba(26,28,30,0.06),0_6px_18px_rgba(26,28,30,0.06)]";

function Campo({ label, name, error, children }: { label: string; name: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name} className="text-[13px] font-semibold text-charcoal">{label}</Label>
      {children}
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
}

function Select({ id, name, children, ...rest }: React.ComponentProps<"select">) {
  return (
    <div className="relative">
      <select id={id} name={name} className={SEL} {...rest}>{children}</select>
      <ChevronDown className="text-muted-foreground pointer-events-none absolute right-3.5 top-4 size-4" />
    </div>
  );
}

/** Un párrafo del texto con la EPS escrita resaltada donde va el marcador. */
function Parrafo({ texto, eps }: { texto: string; eps: string }) {
  const partes = texto.split("{{EPS}}");
  return (
    <p className="text-charcoal m-0 text-sm leading-[1.65]">
      {partes.map((p, i) => (
        <span key={i}>
          {p}
          {i < partes.length - 1 && <mark className="bg-primary/50 rounded px-1 font-bold text-foreground">{eps.trim() || "____________"}</mark>}
        </span>
      ))}
    </p>
  );
}

/**
 * Identificación + resumen + texto íntegro + "Apruebo" + firma (R5), diseño C
 * "Resumen primero" (Laura, 1-oct-2026). El texto legal se muestra COMPLETO, partido
 * en las partes del acordeón (todas están en la página, abiertas o plegadas); el
 * resumen orienta y lo dice. La EPS que escriba el papá se refleja en vivo en el
 * párrafo que la nombra, para que lea exactamente lo que va a firmar.
 */
export function ConsentimientoForm({ textos, precargado }: { textos: { menores: TextoConsentimiento; adultos: TextoConsentimiento }; precargado?: Precargado }) {
  const [state, action, pending] = useActionState<ConsentimientoState, FormData>(firmarConsentimiento, {});
  const fe = state.fieldErrors ?? {};
  const [fecha, setFecha] = useState(precargado?.menor?.fechaNacimiento ?? "");
  const [eps, setEps] = useState(precargado?.menor?.eps ?? "");
  const [tipoDoc, setTipoDoc] = useState(precargado?.menor?.tipoDocumento ?? "");
  const [nombres, setNombres] = useState(precargado?.menor?.nombres ?? "");
  const [apellidos, setApellidos] = useState(precargado?.menor?.apellidos ?? "");
  const [nombreFirmante, setNombreFirmante] = useState(precargado?.firmante?.nombre ?? "");
  const [parentesco, setParentesco] = useState(precargado?.firmante?.parentesco ?? "");
  const [editando, setEditando] = useState(false);
  const [firmaOk, setFirmaOk] = useState(false);
  const onFirma = useCallback((ok: boolean) => setFirmaOk(ok), []);

  const nombreMenor = `${nombres} ${apellidos}`.trim();
  const edad = edadDesde(fecha);
  // Con 18 o más firma por sí mismo, con el texto de ADULTOS (club, 7-oct-2026); no se piden acudientes.
  const mayor = edad != null && edad >= 18;
  const texto = mayor ? textos.adultos : textos.menores;

  const titulos = titulosDelTexto(texto.codigo, texto.parrafos.length);
  // Una sola parte abierta a la vez (Laura, 8-oct-2026): arranca la primera; abrir otra cierra la anterior,
  // para que la persona vea por dónde va. Antes se abrían la primera y la de la EPS, con un botón de abrir todas.
  const [abiertoIdx, setAbiertoIdx] = useState<number | null>(0);
  const alternar = (i: number) => setAbiertoIdx((a) => (a === i ? null : i));
  const bloqueado = !!precargado?.menor;
  const resumido = bloqueado && !editando;
  const iniciales = nombreMenor.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "—";

  const alCambiarFecha = (v: string) => {
    setFecha(v);
    if (!tipoDoc) setTipoDoc(tipoDocumentoPorEdad(edadDesde(v)) ?? "");
  };

  // Enviar desde onSubmit (transición) y no con `<form action>`: React 19 vacía los campos no
  // controlados al terminar la acción, y un error del servidor dejaría la pantalla en blanco.
  const alEnviar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => action(fd));
  };

  if (state.noEncontrado) {
    return (
      <div className={cn(CARD, "space-y-4 p-5")}>
        <h2 className="font-heading text-xl font-extrabold tracking-tight">No encontramos ese registro</h2>
        <p className="text-muted-foreground text-sm leading-relaxed">
          No tenemos una ficha con esos datos. Llena primero los datos del deportista y al final podrás firmar el consentimiento.
        </p>
        <Link href="/registro/datos" className="text-[#46530a] text-sm font-semibold hover:underline">Ir a ingresar los datos →</Link>
        <p className="text-muted-foreground text-xs">Si crees que es un error, acércate a recepción.</p>
      </div>
    );
  }

  return (
    <form onSubmit={alEnviar} className="flex flex-col gap-3">
      {/* Honeypot: invisible para una persona; un robot lo llena y el servidor descarta el envío. */}
      <div className="absolute -left-[9999px] top-0" aria-hidden>
        <label>Sitio web <input type="text" name="sitio_web" tabIndex={-1} autoComplete="off" /></label>
      </div>

      {/* Título de la página unificado con el deportista (Laura, 2-oct-2026) */}
      <div className={cn(CARD, "overflow-hidden")}>
        <Link href="/registro" className="flex items-center gap-3 px-5 py-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/registro-logo.jpg" alt="Centro Deportivo Alejandro Falla" width={40} height={40} className="size-10 shrink-0 rounded-[10px] object-cover" />
          <h1 className="font-heading text-lg font-extrabold uppercase italic leading-tight">Consentimiento informado</h1>
        </Link>
        {resumido && (
          <div className="flex items-center gap-3.5 border-t px-5 py-4">
            <span className="bg-stadium text-primary font-heading flex size-11 shrink-0 items-center justify-center rounded-xl text-base font-extrabold">{iniciales}</span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-[15px] font-bold">{nombreMenor}</span>
              <span className="text-muted-foreground text-[13px]">
                {edad != null ? `${edad} años · ` : ""}EPS {eps || "—"}{!mayor && nombreFirmante ? ` · firma ${nombreFirmante}${parentesco ? ` (${parentesco.toLowerCase()})` : ""}` : ""}
              </span>
            </span>
            <button type="button" onClick={() => setEditando(true)} className="text-[#46530a] shrink-0 text-[13px] font-semibold hover:underline">Editar</button>
          </div>
        )}
      </div>

      <section hidden={resumido} className={cn(CARD, "space-y-5 p-5")}>
        <div className="space-y-1">
          <h2 className="font-heading text-lg font-extrabold tracking-tight">¿Por quién firmas?</h2>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
        <Campo label="Nombres" name="nombres" error={fe.nombres}>
          <Input id="nombres" name="nombres" required readOnly={bloqueado} value={nombres} onChange={(e) => setNombres(e.target.value)} className={INPUT} />
        </Campo>
        <Campo label="Apellidos" name="apellidos" error={fe.apellidos}>
          <Input id="apellidos" name="apellidos" required readOnly={bloqueado} value={apellidos} onChange={(e) => setApellidos(e.target.value)} className={INPUT} />
        </Campo>
        <Campo label="Fecha de nacimiento" name="fechaNacimiento" error={fe.fechaNacimiento}>
          <Input id="fechaNacimiento" name="fechaNacimiento" type="date" required readOnly={bloqueado} value={fecha} onChange={(e) => alCambiarFecha(e.target.value)} className={INPUT} />
        </Campo>
        <div className="grid grid-cols-[110px_1fr] gap-3">
          <Campo label="Tipo" name="tipoDocumento" error={fe.tipoDocumento}>
            <Select id="tipoDocumento" name={bloqueado ? undefined : "tipoDocumento"} required value={tipoDoc} onChange={(e) => setTipoDoc(e.target.value)} disabled={bloqueado}>
              <option value="">—</option>
              {TIPOS_DOCUMENTO.filter((t) => t.valor !== "NIT").map((t) => <option key={t.valor} value={t.valor}>{t.valor}</option>)}
            </Select>
            {bloqueado && <input type="hidden" name="tipoDocumento" value={tipoDoc} />}
          </Campo>
          <Campo label="Documento" name="documento" error={fe.documento}>
            <Input id="documento" name="documento" inputMode="numeric" required readOnly={bloqueado} defaultValue={precargado?.menor?.documento ?? ""} className={INPUT} placeholder="Sin puntos" />
          </Campo>
        </div>
        <Campo label="EPS" name="eps" error={fe.eps}>
          <Input id="eps" name="eps" required value={eps} onChange={(e) => setEps(e.target.value)} placeholder="Sura, Nueva EPS, Salud Total…" className={INPUT} />
        </Campo>
        <Campo label="RH (grupo sanguíneo)" name="rh" error={fe.rh}>
          <Select id="rh" name="rh" defaultValue={precargado?.menor?.rh ?? ""}>
            <option value="">—</option>
            {RH_VALORES.map((v) => <option key={v} value={v}>{v}</option>)}
          </Select>
        </Campo>
        </div>

        {!mayor && (
          <div className="grid gap-5 border-t pt-5 md:grid-cols-2">
            <div className="space-y-1 md:col-span-2">
              <h2 className="font-heading text-lg font-extrabold tracking-tight">Quién firma</h2>
            </div>
            <Campo label="Nombre completo" name="firmanteNombre" error={fe.firmanteNombre}>
              <Input id="firmanteNombre" name="firmanteNombre" required={!mayor} value={nombreFirmante} onChange={(e) => setNombreFirmante(e.target.value)} autoComplete="name" className={INPUT} />
            </Campo>
            <div className="grid grid-cols-[1fr_130px] gap-3">
              <Campo label="Cédula" name="firmanteDocumento" error={fe.firmanteDocumento}>
                <Input id="firmanteDocumento" name="firmanteDocumento" inputMode="numeric" required={!mayor} defaultValue={precargado?.firmante?.documento ?? ""} className={INPUT} placeholder="Sin puntos" />
              </Campo>
              <Campo label="Parentesco" name="firmanteParentesco" error={fe.firmanteParentesco}>
                <Select id="firmanteParentesco" name="firmanteParentesco" value={parentesco} onChange={(e) => setParentesco(e.target.value)}>
                  <option value="">—</option>
                  <option value="Madre">Madre</option>
                  <option value="Padre">Padre</option>
                  <option value="Acudiente">Otro</option>
                </Select>
              </Campo>
            </div>
            <Campo label="Celular" name="firmanteCelular" error={fe.firmanteCelular}>
              <Input id="firmanteCelular" name="firmanteCelular" inputMode="tel" defaultValue={precargado?.firmante?.celular ?? ""} autoComplete="tel" className={INPUT} placeholder="300 000 0000" />
            </Campo>
            <Campo label="Correo" name="firmanteEmail" error={fe.firmanteEmail}>
              <Input id="firmanteEmail" name="firmanteEmail" type="email" defaultValue={precargado?.firmante?.email ?? ""} autoComplete="email" className={INPUT} placeholder="nombre@correo.com" />
            </Campo>
          </div>
        )}
        {bloqueado && editando && (
          <button type="button" onClick={() => setEditando(false)} className="text-muted-foreground text-sm font-semibold hover:underline">Listo, volver al resumen</button>
        )}
      </section>

      {/* En resumen */}
      <section className={cn(CARD, "space-y-3.5 p-5")}>
        <div className="flex items-center gap-2.5">
          <span className="bg-primary/35 flex size-8 items-center justify-center rounded-[9px]"><ListChecks className="size-[18px] text-[#46530a]" /></span>
          <h2 className="font-heading text-[19px] font-extrabold tracking-tight">En resumen</h2>
        </div>
        <p className="text-muted-foreground text-sm leading-relaxed">A continuación encontrarás los puntos principales del consentimiento informado del Centro Deportivo Alejandro Falla. Te recomendamos leer el documento completo antes de firmar.</p>
        <ul className="m-0 list-none space-y-3 p-0">
          {resumenDelConsentimiento(nombreMenor, eps, mayor).map((linea, i) => (
            <li key={i} className="flex items-start gap-3 text-sm leading-[1.55]">
              <Check className="mt-0.5 size-[18px] shrink-0 text-[#46530a]" strokeWidth={2.6} />
              <span>{linea}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Texto completo */}
      <section className={cn(CARD, "overflow-hidden")}>
        <div className="space-y-2 px-5 pb-4 pt-5">
          <h2 className="font-heading text-[19px] font-extrabold tracking-tight">El documento completo</h2>
          <p className="font-heading text-muted-foreground text-[11px] font-bold uppercase tracking-wide">{texto.titulo}</p>
        </div>
        {texto.parrafos.map((p, i) => {
          const abierto = abiertoIdx === i;
          return (
            <div key={i} className={cn("border-t transition-colors", abierto && "bg-primary/10 border-l-4 border-l-primary")}>
              <button type="button" aria-expanded={abierto} aria-controls={`parte-${i}`} onClick={() => alternar(i)}
                className={cn("flex w-full items-center justify-between gap-3 py-4 pr-5 text-left text-sm font-bold", abierto ? "pl-4" : "pl-5")}>
                <span className="flex items-center gap-2.5">
                  <span className={cn("font-heading flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold", abierto ? "bg-stadium text-primary" : "bg-muted text-muted-foreground")}>{i + 1}</span>
                  {titulos[i]}
                </span>
                {abierto ? <ChevronUp className="size-[18px] shrink-0" /> : <ChevronDown className="text-muted-foreground size-[18px] shrink-0" />}
              </button>
              <div id={`parte-${i}`} hidden={!abierto} className="pb-5 pl-[48px] pr-5">
                <Parrafo texto={p} eps={eps} />
              </div>
            </div>
          );
        })}
      </section>

      {/* Documento de alguien con otro nombre: al segundo intento puede confirmar (va a revisión). */}
      {precargado?.menor?.confirmado && <input type="hidden" name="confirmoDocumento" value="on" />}
      {state.documentoDudoso && (
        <div className={cn(CARD, "p-1")}>
          <label className="flex cursor-pointer items-start gap-3 rounded-[14px] border-[1.5px] border-[#f2b53d] bg-[#fdf6e3] px-4 py-3.5 text-sm">
              <input type="checkbox" name="confirmoDocumento" className="accent-lime mt-0.5 size-5 shrink-0" />
              <span className="text-charcoal leading-relaxed">Confirmo que el documento y el nombre son correctos.</span>
            </label>
        </div>
      )}

      {/* Apruebo */}
      <label className={cn(CARD, "flex cursor-pointer items-start gap-3 border-[1.5px] border-[#c9d65a] bg-[#fbfce9] px-4.5 py-4")}>
        <input type="checkbox" name="acepto" required className="accent-lime mt-0.5 size-[22px] shrink-0" />
        <span className="text-sm leading-relaxed">
          <strong>Apruebo.</strong> Leí el consentimiento completo y lo acepto{mayor ? "" : " en nombre de mi hijo(a)"}
          {nombreMenor ? ` (${nombreMenor})` : ""}.
        </span>
      </label>
      {fe.acepto && <p className="text-destructive -mt-1 text-sm">{fe.acepto}</p>}

      {/* Reglamento General (opción A, Laura, 8-oct-2026): se acepta aquí y se lee a un toque */}
      <label className={cn(CARD, "flex cursor-pointer items-start gap-3 border-[1.5px] border-[#c9d65a] bg-[#fbfce9] px-4.5 py-4")}>
        <input type="checkbox" name="aceptoReglamento" required className="accent-lime mt-0.5 size-[22px] shrink-0" />
        <span className="text-sm leading-relaxed">
          Conozco y acepto el <Link href="/registro/reglamento" target="_blank" rel="noopener" className="font-semibold underline underline-offset-2">Reglamento General del Centro Deportivo Alejandro Falla</Link>.
        </span>
      </label>
      {fe.aceptoReglamento && <p className="text-destructive -mt-1 text-sm">{fe.aceptoReglamento}</p>}

      {/* Firma */}
      <section className={cn(CARD, "space-y-3 p-5")}>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-heading text-[19px] font-extrabold tracking-tight">Tu firma</h2>
          <span className="text-muted-foreground truncate text-xs">{mayor ? nombreMenor : nombreFirmante}</span>
        </div>
        <FirmaPad nombreSugerido={mayor ? nombreMenor : nombreFirmante} onCambio={onFirma} />
        {fe.firmaPng && <p className="text-destructive text-sm">{fe.firmaPng}</p>}
      </section>

      {state.error && (
        <p role="alert" className="border-destructive/20 bg-destructive/5 text-destructive rounded-lg border px-3 py-2 text-sm">{state.error}</p>
      )}
      <Button type="submit" size="lg" disabled={pending || !firmaOk} className="bg-stadium text-primary hover:bg-stadium/90 h-[54px] w-full rounded-xl text-base font-bold">
        {pending ? "Guardando la firma…" : "Firmar el consentimiento"}
      </Button>
      <p className="text-muted-foreground text-center text-xs">El PDF firmado queda en la ficha {nombreMenor ? `de ${nombres.trim().split(/\s+/)[0]}` : "del deportista"} en el club.</p>
    </form>
  );
}
