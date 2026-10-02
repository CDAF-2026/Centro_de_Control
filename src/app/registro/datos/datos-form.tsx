"use client";

import { useActionState, useState } from "react";
import { enviarDatos, type DatosState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { edadDesde } from "@/lib/validations/cliente";
import { TIPOS_DOCUMENTO, RH_VALORES, tipoDocumentoPorEdad } from "@/app/(app)/clientes/documento";
import type { Firmante } from "@/lib/registro/sesion";

function Campo({ label, name, error, hint, children }: { label: string; name: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      {children}
      {hint && !error && <p className="text-muted-foreground text-xs">{hint}</p>}
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
}

const sel = "border-input bg-background h-9 w-full rounded-md border px-2 text-sm";

function Seccion({ n, titulo, detalle, children }: { n: string; titulo: string; detalle?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-heading text-lg font-semibold tracking-tight">{n} · {titulo}</h2>
        {detalle && <p className="text-muted-foreground text-sm">{detalle}</p>}
      </div>
      {children}
    </section>
  );
}

function Acudiente({ prefijo, titulo, detalle, obligatorio, inicial, errores }: {
  prefijo: "acudiente" | "acudiente2"; titulo: string; detalle: string; obligatorio: boolean;
  inicial?: Partial<Firmante> & { rol?: string }; errores: Record<string, string>;
}) {
  const n = (c: string) => `${prefijo}${c}`;
  return (
    <div className="space-y-3 rounded-lg border p-4">
      <p className="text-sm font-medium">{titulo} <span className="text-muted-foreground font-normal">· {detalle}</span></p>
      <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
        <Campo label="Es" name={n("Rol")}>
          <select id={n("Rol")} name={n("Rol")} className={sel} defaultValue={inicial?.rol ?? (prefijo === "acudiente" ? "madre" : "padre")}>
            <option value="madre">Madre</option>
            <option value="padre">Padre</option>
            <option value="otro">Otro acudiente</option>
          </select>
        </Campo>
        <Campo label="Nombre completo" name={n("Nombre")} error={errores[n("Nombre")]}>
          <Input id={n("Nombre")} name={n("Nombre")} required={obligatorio} defaultValue={inicial?.nombre ?? ""} autoComplete="name" />
        </Campo>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo label="Cédula" name={n("Documento")} error={errores[n("Documento")]}>
          <Input id={n("Documento")} name={n("Documento")} inputMode="numeric" required={obligatorio} defaultValue={inicial?.documento ?? ""} />
        </Campo>
        <Campo label="Celular" name={n("Telefono")} error={errores[n("Telefono")]}>
          <Input id={n("Telefono")} name={n("Telefono")} inputMode="tel" required={obligatorio} defaultValue={inicial?.celular ?? ""} autoComplete="tel" />
        </Campo>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo label="Correo" name={n("Email")} error={errores[n("Email")]}>
          <Input id={n("Email")} name={n("Email")} type="email" required={obligatorio} defaultValue={inicial?.email ?? ""} autoComplete="email" />
        </Campo>
        <Campo label="Parentesco (si es otro)" name={n("Parentesco")}>
          <Input id={n("Parentesco")} name={n("Parentesco")} defaultValue={inicial?.parentesco ?? ""} placeholder="Abuela, tío…" />
        </Campo>
      </div>
    </div>
  );
}

/**
 * "Actualizar o ingresar datos" (R2): la ficha unificada, idéntica a la del
 * personal (D2). Todo se valida en el servidor; aquí solo se guía. Con 18 o más
 * años (D11) desaparecen los acudientes y la persona da su propio contacto.
 */
export function DatosForm({ firmante }: { firmante?: Firmante | null }) {
  const [state, action, pending] = useActionState<DatosState, FormData>(enviarDatos, {});
  const fe = state.fieldErrors ?? {};
  const [fecha, setFecha] = useState("");
  const [tipoDoc, setTipoDoc] = useState("");
  const [factura, setFactura] = useState(false);
  const edad = edadDesde(fecha);
  const mayor = edad != null && edad >= 18;

  const alCambiarFecha = (v: string) => {
    setFecha(v);
    if (!tipoDoc) setTipoDoc(tipoDocumentoPorEdad(edadDesde(v)) ?? "");
  };

  return (
    <form action={action} className="space-y-7">
      <div className="absolute -left-[9999px] top-0" aria-hidden>
        <label>Sitio web <input type="text" name="sitio_web" tabIndex={-1} autoComplete="off" /></label>
      </div>

      <Seccion n="1" titulo="El deportista" detalle="Tal como aparece en su documento de identidad.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Nombres" name="nombres" error={fe.nombres}><Input id="nombres" name="nombres" required /></Campo>
          <Campo label="Apellidos" name="apellidos" error={fe.apellidos}><Input id="apellidos" name="apellidos" required /></Campo>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Fecha de nacimiento" name="fechaNacimiento" error={fe.fechaNacimiento}>
            <Input id="fechaNacimiento" name="fechaNacimiento" type="date" required value={fecha} onChange={(e) => alCambiarFecha(e.target.value)} />
          </Campo>
          <div className="grid grid-cols-[7rem_1fr] gap-2">
            <Campo label="Tipo" name="tipoDocumento" error={fe.tipoDocumento}>
              <select id="tipoDocumento" name="tipoDocumento" required className={sel} value={tipoDoc} onChange={(e) => setTipoDoc(e.target.value)}>
                <option value="">—</option>
                {TIPOS_DOCUMENTO.filter((t) => t.valor !== "NIT").map((t) => <option key={t.valor} value={t.valor}>{t.valor}</option>)}
              </select>
            </Campo>
            <Campo label="Número de documento" name="documento" error={fe.documento}>
              <Input id="documento" name="documento" inputMode="numeric" required />
            </Campo>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Lugar de nacimiento" name="lugarNacimiento" error={fe.lugarNacimiento}><Input id="lugarNacimiento" name="lugarNacimiento" placeholder="Ciudad" /></Campo>
          <Campo label="EPS" name="eps" error={fe.eps}><Input id="eps" name="eps" required placeholder="Sura, Nueva EPS, Salud Total…" /></Campo>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="RH (grupo sanguíneo)" name="rh" error={fe.rh}>
            <select id="rh" name="rh" className={sel} defaultValue="">
              <option value="">—</option>
              {RH_VALORES.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </Campo>
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">Deporte</legend>
            <div className="flex gap-5 pt-2 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" name="deportes" value="tenis" className="size-4" /> Tenis</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="deportes" value="padel" className="size-4" /> Pádel</label>
            </div>
          </fieldset>
        </div>
      </Seccion>

      <Seccion n="2" titulo={mayor ? "Tus datos de contacto" : "Contacto de la familia"} detalle={mayor ? undefined : "Dirección y a quién llamar en una emergencia."}>
        <Campo label="Dirección de residencia" name="direccion" error={fe.direccion}><Input id="direccion" name="direccion" autoComplete="street-address" /></Campo>
        {mayor && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo label="Celular" name="celular" error={fe.celular}><Input id="celular" name="celular" inputMode="tel" required autoComplete="tel" /></Campo>
            <Campo label="Correo" name="email" error={fe.email}><Input id="email" name="email" type="email" required autoComplete="email" /></Campo>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-3">
          <Campo label="Contacto de emergencia" name="emergenciaNombre" error={fe.emergenciaNombre}><Input id="emergenciaNombre" name="emergenciaNombre" placeholder="Nombre" /></Campo>
          <Campo label="Celular de emergencia" name="emergenciaCelular" error={fe.emergenciaCelular}><Input id="emergenciaCelular" name="emergenciaCelular" inputMode="tel" /></Campo>
          <Campo label="Parentesco" name="emergenciaParentesco" error={fe.emergenciaParentesco}><Input id="emergenciaParentesco" name="emergenciaParentesco" placeholder="Mamá, tío…" /></Campo>
        </div>
      </Seccion>

      {!mayor && (
        <Seccion n="3" titulo="Padre, madre o acudiente" detalle={edad != null ? `Tiene ${edad} años. Al menos uno es obligatorio; es quien firma y recibe los correos del club.` : "Al menos uno es obligatorio; es quien firma y recibe los correos del club."}>
          <input type="hidden" name="acudientesVisibles" value="1" />
          <Acudiente prefijo="acudiente" titulo="Acudiente principal" detalle="quien diligencia" obligatorio inicial={firmante ?? undefined} errores={fe} />
          <Acudiente prefijo="acudiente2" titulo="Segundo acudiente" detalle="opcional" obligatorio={false} errores={fe} />
        </Seccion>
      )}

      <Seccion n={mayor ? "3" : "4"} titulo="Facturación" detalle="Solo si las facturas del club deben salir a nombre de otra persona o empresa.">
        <label className="bg-muted/40 hover:bg-muted/60 flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors">
          <input type="checkbox" checked={factura} onChange={(e) => setFactura(e.target.checked)} className="accent-lime size-4" />
          Quiero indicar datos de facturación electrónica
        </label>
        {factura && (
          <div className="space-y-3 rounded-lg border p-4">
            <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
              <Campo label="Tipo" name="facturaTipo">
                <select id="facturaTipo" name="facturaTipo" className={sel} defaultValue="natural">
                  <option value="natural">Persona natural</option>
                  <option value="juridica">Persona jurídica</option>
                </select>
              </Campo>
              <Campo label="Razón social o nombre" name="facturaANombre" error={fe.facturaANombre}><Input id="facturaANombre" name="facturaANombre" /></Campo>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo label="NIT o cédula" name="facturaANit" error={fe.facturaANit}><Input id="facturaANit" name="facturaANit" inputMode="numeric" /></Campo>
              <Campo label="Correo para envío de facturas" name="facturaEmail" error={fe.facturaEmail}><Input id="facturaEmail" name="facturaEmail" type="email" /></Campo>
            </div>
            <p className="text-muted-foreground text-xs">Si la ficha ya tenía otro NIT, el cambio lo confirma el club antes de aplicarse.</p>
          </div>
        )}
      </Seccion>

      <label className="bg-muted/40 hover:bg-muted/60 flex cursor-pointer items-start gap-3 rounded-md px-3 py-3 text-sm transition-colors">
        <input type="checkbox" name="acepto_datos" required className="accent-lime mt-0.5 size-4" />
        <span>Autorizo al Centro Deportivo Alejandro Falla el tratamiento de estos datos para la gestión de las actividades deportivas, conforme a la Ley 1581 de 2012.</span>
      </label>
      {fe.acepto_datos && <p className="text-destructive text-sm">{fe.acepto_datos}</p>}

      {state.error && (
        <p role="alert" className="border-destructive/20 bg-destructive/5 text-destructive rounded-lg border px-3 py-2 text-sm">{state.error}</p>
      )}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Guardando…" : "Guardar y pasar a firmar"}
      </Button>
    </form>
  );
}
