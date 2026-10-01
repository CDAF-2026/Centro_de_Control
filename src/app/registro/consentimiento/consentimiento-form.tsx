"use client";

import { useActionState, useCallback, useState } from "react";
import Link from "next/link";
import { firmarConsentimiento, type ConsentimientoState } from "./actions";
import { FirmaPad } from "./firma-pad";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { edadDesde } from "@/lib/validations/cliente";
import { TIPOS_DOCUMENTO, RH_VALORES, tipoDocumentoPorEdad } from "@/app/(app)/clientes/documento";

export type TextoConsentimiento = { codigo: string; titulo: string; parrafos: string[] };

/** Un dato de la sesión del recorrido: viene de "Actualizar datos" (Fase 3) y evita volver a pedirlo. */
export type Precargado = {
  menor?: { nombres: string; apellidos: string; documento: string; tipoDocumento: string; fechaNacimiento: string; eps: string; rh: string };
  firmante?: { nombre: string; documento: string; parentesco?: string; celular?: string; email?: string };
};

function Campo({
  label, name, error, children,
}: { label: string; name: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      {children}
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
}

const sel = "border-input bg-background h-9 w-full rounded-md border px-2 text-sm";

/**
 * Identificación + texto + "Apruebo" + firma (R5). El texto se muestra COMPLETO
 * en un cuadro con scroll; la EPS que escriba el papá se refleja en vivo en el
 * párrafo que la nombra, para que lea exactamente lo que va a firmar.
 */
export function ConsentimientoForm({ texto, precargado }: { texto: TextoConsentimiento; precargado?: Precargado }) {
  const [state, action, pending] = useActionState<ConsentimientoState, FormData>(firmarConsentimiento, {});
  const fe = state.fieldErrors ?? {};
  const [fecha, setFecha] = useState(precargado?.menor?.fechaNacimiento ?? "");
  const [eps, setEps] = useState(precargado?.menor?.eps ?? "");
  const [tipoDoc, setTipoDoc] = useState(precargado?.menor?.tipoDocumento ?? "");
  const [nombreMenor, setNombreMenor] = useState(
    precargado?.menor ? `${precargado.menor.nombres} ${precargado.menor.apellidos}` : "",
  );
  const [nombreFirmante, setNombreFirmante] = useState(precargado?.firmante?.nombre ?? "");
  const [firmaOk, setFirmaOk] = useState(false);
  const onFirma = useCallback((ok: boolean) => setFirmaOk(ok), []);

  const edad = edadDesde(fecha);
  // D11: si ya tiene 18, firma por sí mismo con el mismo texto; no se piden acudientes.
  const mayor = edad != null && edad >= 18;
  const bloqueado = !!precargado?.menor;

  const alCambiarFecha = (v: string) => {
    setFecha(v);
    if (!tipoDoc) setTipoDoc(tipoDocumentoPorEdad(edadDesde(v)) ?? "");
  };

  if (state.noEncontrado) {
    return (
      <div className="space-y-4">
        <h2 className="font-heading text-xl font-semibold tracking-tight">No encontramos ese registro</h2>
        <p className="text-muted-foreground text-sm">
          No tenemos una ficha con esos datos. Llena primero los datos del deportista y al final podrás firmar el
          consentimiento.
        </p>
        <Link href="/registro/datos" className="text-primary text-sm font-medium hover:underline">
          Ir a ingresar los datos →
        </Link>
        <p className="text-muted-foreground text-xs">Si crees que es un error, acércate a recepción.</p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-6">
      {/* Honeypot: invisible para una persona; un robot lo llena y el servidor descarta el envío. */}
      <div className="absolute -left-[9999px] top-0" aria-hidden>
        <label>
          Sitio web <input type="text" name="sitio_web" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <section className="space-y-4">
        <div>
          <h2 className="font-heading text-lg font-semibold tracking-tight">1 · ¿Por quién firmas?</h2>
          <p className="text-muted-foreground text-sm">Los datos del deportista, tal como están en su documento.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Nombres" name="nombres" error={fe.nombres}>
            <Input id="nombres" name="nombres" required readOnly={bloqueado} defaultValue={precargado?.menor?.nombres ?? ""}
              onChange={(e) => setNombreMenor(`${e.target.value} ${(document.getElementById("apellidos") as HTMLInputElement | null)?.value ?? ""}`)} />
          </Campo>
          <Campo label="Apellidos" name="apellidos" error={fe.apellidos}>
            <Input id="apellidos" name="apellidos" required readOnly={bloqueado} defaultValue={precargado?.menor?.apellidos ?? ""}
              onChange={(e) => setNombreMenor(`${(document.getElementById("nombres") as HTMLInputElement | null)?.value ?? ""} ${e.target.value}`)} />
          </Campo>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Fecha de nacimiento" name="fechaNacimiento" error={fe.fechaNacimiento}>
            <Input id="fechaNacimiento" name="fechaNacimiento" type="date" required readOnly={bloqueado} value={fecha} onChange={(e) => alCambiarFecha(e.target.value)} />
          </Campo>
          <div className="grid grid-cols-[7rem_1fr] gap-2">
            <Campo label="Tipo" name="tipoDocumento" error={fe.tipoDocumento}>
              <select id="tipoDocumento" name="tipoDocumento" required className={sel} value={tipoDoc} onChange={(e) => setTipoDoc(e.target.value)} disabled={bloqueado}>
                <option value="">—</option>
                {TIPOS_DOCUMENTO.filter((t) => t.valor !== "NIT").map((t) => (
                  <option key={t.valor} value={t.valor}>{t.valor}</option>
                ))}
              </select>
              {bloqueado && <input type="hidden" name="tipoDocumento" value={tipoDoc} />}
            </Campo>
            <Campo label="Número de documento" name="documento" error={fe.documento}>
              <Input id="documento" name="documento" inputMode="numeric" required readOnly={bloqueado} defaultValue={precargado?.menor?.documento ?? ""} />
            </Campo>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="EPS" name="eps" error={fe.eps}>
            <Input id="eps" name="eps" required value={eps} onChange={(e) => setEps(e.target.value)} placeholder="Sura, Nueva EPS, Salud Total…" />
          </Campo>
          <Campo label="RH (grupo sanguíneo)" name="rh" error={fe.rh}>
            <select id="rh" name="rh" className={sel} defaultValue={precargado?.menor?.rh ?? ""}>
              <option value="">—</option>
              {RH_VALORES.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </Campo>
        </div>
      </section>

      {!mayor && (
        <section className="space-y-4">
          <div>
            <h2 className="font-heading text-lg font-semibold tracking-tight">2 · Quién firma</h2>
            <p className="text-muted-foreground text-sm">
              {edad != null ? `${nombreMenor.trim() || "El deportista"} tiene ${edad} años: firma el padre, la madre o el acudiente.` : "El padre, la madre o el acudiente del deportista."}
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo label="Nombre completo" name="firmanteNombre" error={fe.firmanteNombre}>
              <Input id="firmanteNombre" name="firmanteNombre" required={!mayor} value={nombreFirmante} onChange={(e) => setNombreFirmante(e.target.value)} autoComplete="name" />
            </Campo>
            <Campo label="Cédula" name="firmanteDocumento" error={fe.firmanteDocumento}>
              <Input id="firmanteDocumento" name="firmanteDocumento" inputMode="numeric" required={!mayor} defaultValue={precargado?.firmante?.documento ?? ""} />
            </Campo>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Campo label="Parentesco" name="firmanteParentesco" error={fe.firmanteParentesco}>
              <select id="firmanteParentesco" name="firmanteParentesco" className={sel} defaultValue={precargado?.firmante?.parentesco ?? ""}>
                <option value="">—</option>
                <option value="Madre">Madre</option>
                <option value="Padre">Padre</option>
                <option value="Acudiente">Otro acudiente</option>
              </select>
            </Campo>
            <Campo label="Celular" name="firmanteCelular" error={fe.firmanteCelular}>
              <Input id="firmanteCelular" name="firmanteCelular" inputMode="tel" defaultValue={precargado?.firmante?.celular ?? ""} autoComplete="tel" />
            </Campo>
            <Campo label="Correo" name="firmanteEmail" error={fe.firmanteEmail}>
              <Input id="firmanteEmail" name="firmanteEmail" type="email" defaultValue={precargado?.firmante?.email ?? ""} autoComplete="email" />
            </Campo>
          </div>
        </section>
      )}

      <section className="space-y-3">
        <div>
          <h2 className="font-heading text-lg font-semibold tracking-tight">{mayor ? "2" : "3"} · Lee el consentimiento</h2>
          <p className="text-muted-foreground text-sm">Versión {texto.codigo}. Es el mismo texto que quedará en el PDF firmado.</p>
        </div>
        <div className="bg-muted/30 max-h-72 space-y-3 overflow-y-auto rounded-lg border p-4 text-sm leading-relaxed">
          <p className="font-heading text-xs font-semibold uppercase tracking-wide">{texto.titulo}</p>
          {texto.parrafos.map((p, i) => (
            <p key={i}>{p.replace(/\{\{EPS\}\}/g, eps.trim() || "____________")}</p>
          ))}
        </div>
        <label className="bg-muted/40 hover:bg-muted/60 flex cursor-pointer items-start gap-3 rounded-md px-3 py-3 text-sm transition-colors">
          <input type="checkbox" name="acepto" required className="accent-lime mt-0.5 size-4" />
          <span>
            <strong>Apruebo.</strong> Leí el consentimiento completo y lo acepto{mayor ? "" : " en nombre de mi hijo(a)"}
            {nombreMenor.trim() ? ` (${nombreMenor.trim()})` : ""}.
          </span>
        </label>
        {fe.acepto && <p className="text-destructive text-sm">{fe.acepto}</p>}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="font-heading text-lg font-semibold tracking-tight">{mayor ? "3" : "4"} · Firma</h2>
          <p className="text-muted-foreground text-sm">
            La fecha, la hora y el dispositivo quedan registrados como evidencia de la firma.
          </p>
        </div>
        <FirmaPad nombreSugerido={mayor ? nombreMenor.trim() : nombreFirmante} onCambio={onFirma} />
        {fe.firmaPng && <p className="text-destructive text-sm">{fe.firmaPng}</p>}
      </section>

      {state.error && (
        <p role="alert" className="border-destructive/20 bg-destructive/5 text-destructive rounded-lg border px-3 py-2 text-sm">
          {state.error}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" disabled={pending || !firmaOk}>
        {pending ? "Guardando la firma…" : "Firmar el consentimiento"}
      </Button>
    </form>
  );
}
