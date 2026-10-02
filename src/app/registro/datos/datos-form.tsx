"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { ArrowRight, ChevronDown } from "lucide-react";
import { enviarDatos, type DatosState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { edadDesde } from "@/lib/validations/cliente";
import { TIPOS_DOCUMENTO, RH_VALORES, tipoDocumentoPorEdad } from "@/app/(app)/clientes/documento";
import type { Firmante } from "@/lib/registro/sesion";

/* ───────────── Piezas de la pantalla (diseño A "Paso a paso") ───────────── */

const INPUT = "h-12 rounded-[10px] border-[1.5px] px-3.5 text-[15px] md:text-[15px]";
const SEL = "border-input bg-card h-12 w-full appearance-none rounded-[10px] border-[1.5px] px-3.5 pr-9 text-[15px]";

function Campo({ label, name, error, hint, children }: { label: string; name: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name} className="text-[13px] font-semibold text-charcoal">{label}</Label>
      {children}
      {hint && !error && <p className="text-muted-foreground text-xs">{hint}</p>}
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

function Encabezado({ pregunta, detalle }: { pregunta: string; detalle?: string }) {
  return (
    <div className="space-y-1.5">
      <h2 className="font-heading text-[22px] font-extrabold tracking-tight">{pregunta}</h2>
      {detalle && <p className="text-muted-foreground text-sm leading-relaxed">{detalle}</p>}
    </div>
  );
}

type ClavePaso = "deportista" | "familia" | "acudientes" | "facturacion";
const TITULO: Record<ClavePaso, string> = { deportista: "El deportista", familia: "Contacto", acudientes: "Acudientes", facturacion: "Facturación" };

/** Qué campos viven en cada paso: con un error del servidor se salta al paso que lo tiene. */
const CAMPOS: Record<ClavePaso, (campo: string) => boolean> = {
  deportista: (c) => ["nombres", "apellidos", "fechaNacimiento", "tipoDocumento", "documento", "lugarNacimiento", "eps", "rh", "deportes"].includes(c),
  familia: (c) => ["direccion", "celular", "email", "emergenciaNombre", "emergenciaCelular", "emergenciaParentesco"].includes(c),
  acudientes: (c) => c.startsWith("acudiente"),
  facturacion: (c) => c.startsWith("factura") || c === "acepto_datos",
};

/** El acudiente: UNO solo en la página pública (Laura, 2-oct-2026), con su parentesco. */
function Acudiente({ inicial, errores }: { inicial?: Partial<Firmante> & { rol?: string }; errores: Record<string, string> }) {
  const n = (c: string) => `acudiente${c}`;
  const [rol, setRol] = useState(inicial?.rol ?? "madre");
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <input type="hidden" name={n("Rol")} value={rol} />
      <fieldset className="space-y-1.5 md:col-span-2">
        <legend className="text-[13px] font-semibold text-charcoal">Es</legend>
        <div className="grid grid-cols-3 gap-2.5 pt-1.5">
          {([["madre", "Madre"], ["padre", "Padre"], ["otro", "Otro familiar"]] as const).map(([v, t]) => (
            <button key={v} type="button" role="radio" aria-checked={rol === v} onClick={() => setRol(v)}
              className={cn("h-12 rounded-[10px] border-[1.5px] px-1 text-[13px] font-semibold transition-colors", rol === v ? "border-stadium bg-stadium text-primary" : "text-charcoal")}>{t}</button>
          ))}
        </div>
      </fieldset>
      {rol === "otro" && (
        <div className="md:col-span-2">
          <Campo label="Parentesco" name={n("Parentesco")}>
            <Input id={n("Parentesco")} name={n("Parentesco")} defaultValue={inicial?.parentesco ?? ""} placeholder="Abuela, tío…" className={INPUT} />
          </Campo>
        </div>
      )}
      <Campo label="Nombre completo" name={n("Nombre")} error={errores[n("Nombre")]}>
        <Input id={n("Nombre")} name={n("Nombre")} required defaultValue={inicial?.nombre ?? ""} autoComplete="name" className={INPUT} />
      </Campo>
      <Campo label="Cédula" name={n("Documento")} error={errores[n("Documento")]}>
        <Input id={n("Documento")} name={n("Documento")} inputMode="numeric" required defaultValue={inicial?.documento ?? ""} className={INPUT} placeholder="Sin puntos" />
      </Campo>
      <Campo label="Celular" name={n("Telefono")} error={errores[n("Telefono")]}>
        <Input id={n("Telefono")} name={n("Telefono")} inputMode="tel" required defaultValue={inicial?.celular ?? ""} autoComplete="tel" className={INPUT} placeholder="300 000 0000" />
      </Campo>
      <Campo label="Correo" name={n("Email")} error={errores[n("Email")]}>
        <Input id={n("Email")} name={n("Email")} type="email" required defaultValue={inicial?.email ?? ""} autoComplete="email" className={INPUT} placeholder="nombre@correo.com" />
      </Campo>
    </div>
  );
}

type Snap = Record<string, string>;
type OpcionFactura = { valor: "acudiente" | "propio" | "otro"; titulo: string; sub?: string; detalle?: string; datos?: { nombre: string; nit: string; email: string } };

/** Las opciones de "¿a nombre de quién salen las facturas?", armadas con lo escrito en los pasos anteriores. */
function opcionesFactura(snap: Snap, mayor: boolean): OpcionFactura[] {
  const rol = (r: string) => (r === "madre" ? "Madre" : r === "padre" ? "Padre" : "Familiar");
  const ops: OpcionFactura[] = [];
  if (mayor) {
    const nombre = `${snap.nombres ?? ""} ${snap.apellidos ?? ""}`.trim();
    ops.push({ valor: "propio", titulo: nombre || "A mi nombre", sub: "A mi nombre", detalle: [snap.tipoDocumento && snap.documento ? `${snap.tipoDocumento} ${snap.documento}` : "", snap.email ?? ""].filter(Boolean).join(" · "), datos: { nombre, nit: snap.documento ?? "", email: snap.email ?? "" } });
  } else {
    ops.push({ valor: "acudiente", titulo: snap.acudienteNombre || "Acudiente", sub: rol(snap.acudienteRol ?? ""), detalle: [snap.acudienteDocumento ? `CC ${snap.acudienteDocumento}` : "", snap.acudienteEmail ?? ""].filter(Boolean).join(" · "), datos: { nombre: snap.acudienteNombre ?? "", nit: snap.acudienteDocumento ?? "", email: snap.acudienteEmail ?? "" } });
  }
  ops.push({ valor: "otro", titulo: "Otra persona o empresa" });
  return ops;
}

/**
 * "Actualizar o ingresar datos" (R2): la ficha unificada, idéntica a la del personal
 * (D2), en CUATRO pasos (diseño A, Laura 1-oct-2026): deportista → contacto →
 * acudientes → facturación. Con 18 o más años (D11) desaparece el paso de acudientes
 * y la persona da su propio contacto.
 *
 * Los pasos que no se ven siguen MONTADOS (ocultos con `hidden`): es un solo
 * formulario y todo viaja junto al final. Cada paso se valida en el navegador antes
 * de avanzar; el servidor valida todo otra vez y, si devuelve un error, la pantalla
 * salta al paso que lo tiene.
 *
 * Facturación es OBLIGATORIA (Laura, 1-oct-2026): se elige de quién se toman los datos
 * (el acudiente, uno mismo si es mayor, u otra persona o empresa) y los campos viajan
 * llenos siempre; el servidor los exige.
 *
 * Un solo acudiente y sin textos explicativos (Laura, 2-oct-2026): la pantalla pide
 * lo mínimo y no explica lo obvio; el segundo acudiente se agrega desde la ficha.
 */
export function DatosForm({ firmante }: { firmante?: Firmante | null }) {
  const [state, action, pending] = useActionState<DatosState, FormData>(enviarDatos, {});
  const fe = state.fieldErrors ?? {};
  const formRef = useRef<HTMLFormElement>(null);
  const [fecha, setFecha] = useState("");
  const [tipoDoc, setTipoDoc] = useState("");
  const [paso, setPaso] = useState(0);
  const [snap, setSnap] = useState<Snap>({});
  const [facturaDe, setFacturaDe] = useState<OpcionFactura["valor"] | "">("");
  const [otro, setOtro] = useState({ tipo: "natural", nombre: "", nit: "", email: "" });

  const edad = edadDesde(fecha);
  const mayor = edad != null && edad >= 18;
  const pasos: ClavePaso[] = mayor ? ["deportista", "familia", "facturacion"] : ["deportista", "familia", "acudientes", "facturacion"];
  const actual = pasos[Math.min(paso, pasos.length - 1)];
  const ultimo = actual === "facturacion";

  const alCambiarFecha = (v: string) => {
    setFecha(v);
    if (!tipoDoc) setTipoDoc(tipoDocumentoPorEdad(edadDesde(v)) ?? "");
  };

  // Un error del servidor lleva al paso que lo tiene (si no, quedaría escondido).
  useEffect(() => {
    const campos = Object.keys(fe);
    if (!campos.length) return;
    const i = pasos.findIndex((p) => campos.some(CAMPOS[p]));
    if (i >= 0) setPaso(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  /** Valida los campos VISIBLES de un paso con las reglas del navegador (required, email…). */
  const pasoValido = (clave: ClavePaso): boolean => {
    const sec = formRef.current?.querySelector<HTMLElement>(`[data-paso="${clave}"]`);
    if (!sec) return true;
    for (const el of Array.from(sec.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select"))) {
      if (!el.checkValidity()) { el.reportValidity(); return false; }
    }
    return true;
  };

  const tomarFoto = () => {
    const fd = formRef.current ? new FormData(formRef.current) : null;
    const s: Snap = {};
    fd?.forEach((v, k) => { if (typeof v === "string") s[k] = v.trim(); });
    setSnap(s);
    return s;
  };

  const continuar = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (!pasoValido(actual)) return;
    tomarFoto();
    if (pasos[paso + 1] === "facturacion" && !facturaDe) setFacturaDe(mayor ? "propio" : "acudiente");
    setPaso(paso + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const volver = () => { setPaso(Math.max(0, paso - 1)); window.scrollTo({ top: 0, behavior: "smooth" }); };

  // Al enviar, un campo inválido en un paso OCULTO bloquearía el envío sin aviso
  // (el navegador no puede enfocarlo): se busca y se salta a ese paso.
  // ⚠️ Se envía desde aquí (transición) y NO con `<form action>`: React 19 vacía los campos
  // no controlados cuando la acción termina, y tras un error del servidor el papá perdía
  // los cuatro pasos escritos.
  const alEnviar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    for (let i = 0; i < pasos.length; i++) {
      if (pasos[i] === actual) continue;
      const sec = formRef.current?.querySelector<HTMLElement>(`[data-paso="${pasos[i]}"]`);
      const malo = sec && Array.from(sec.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select")).find((el) => !el.checkValidity());
      if (malo) { setPaso(i); setTimeout(() => malo.reportValidity(), 50); return; }
    }
    const fd = new FormData(e.currentTarget);
    startTransition(() => action(fd));
  };

  const opciones = opcionesFactura(snap, mayor);
  const elegida = opciones.find((o) => o.valor === facturaDe) ?? opciones[0];
  const esOtro = elegida.valor === "otro";
  const editarComoOtro = () => {
    if (elegida.datos) setOtro({ tipo: "natural", nombre: elegida.datos.nombre, nit: elegida.datos.nit, email: elegida.datos.email });
    setFacturaDe("otro");
  };

  return (
    <form ref={formRef} onSubmit={alEnviar} className="flex flex-col">
      <div className="absolute -left-[9999px] top-0" aria-hidden>
        <label>Sitio web <input type="text" name="sitio_web" tabIndex={-1} autoComplete="off" /></label>
      </div>

      {/* Barra de pasos, sobre el fondo oscuro */}
      <div className="mb-4 space-y-3">
        <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${pasos.length}, minmax(0, 1fr))` }} aria-hidden>
          {pasos.map((p, i) => <div key={p} className={cn("h-[5px] rounded-full", i <= paso ? "bg-primary" : "bg-white/20")} />)}
        </div>
        <span className="text-primary block text-[11px] font-bold uppercase tracking-[0.14em]">Paso {Math.min(paso, pasos.length - 1) + 1} de {pasos.length} · {TITULO[actual]}</span>
      </div>

      <div className="bg-card rounded-[20px] p-6 shadow-xl ring-1 ring-white/5 md:p-9">
        {state.error && (
          <p role="alert" className="border-destructive/20 bg-destructive/5 text-destructive mb-5 rounded-lg border px-3 py-2 text-sm">{state.error}</p>
        )}

        {/* Paso 1 · El deportista */}
        <section data-paso="deportista" hidden={actual !== "deportista"} className="space-y-5">
          <Encabezado pregunta="¿A quién vas a registrar?" />
          <div className="grid gap-5 md:grid-cols-2">
          <Campo label="Nombres" name="nombres" error={fe.nombres}><Input id="nombres" name="nombres" required className={INPUT} autoComplete="off" /></Campo>
          <Campo label="Apellidos" name="apellidos" error={fe.apellidos}><Input id="apellidos" name="apellidos" required className={INPUT} autoComplete="off" /></Campo>
          <Campo label="Fecha de nacimiento" name="fechaNacimiento" error={fe.fechaNacimiento}>
            <Input id="fechaNacimiento" name="fechaNacimiento" type="date" required value={fecha} onChange={(e) => alCambiarFecha(e.target.value)} className={INPUT} />
          </Campo>
          <div className="grid grid-cols-[110px_1fr] gap-3">
            <Campo label="Tipo" name="tipoDocumento" error={fe.tipoDocumento}>
              <Select id="tipoDocumento" name="tipoDocumento" required value={tipoDoc} onChange={(e) => setTipoDoc(e.target.value)}>
                <option value="">—</option>
                {TIPOS_DOCUMENTO.filter((t) => t.valor !== "NIT").map((t) => <option key={t.valor} value={t.valor}>{t.valor}</option>)}
              </Select>
            </Campo>
            <Campo label="Documento" name="documento" error={fe.documento}>
              <Input id="documento" name="documento" inputMode="numeric" required className={INPUT} placeholder="Sin puntos" />
            </Campo>
          </div>
          {/* Segundo intento con un documento que es de alguien de otro nombre: puede confirmar y
              el envío va a revisión sin tocar a nadie (Laura, 2-oct-2026). */}
          {state.documentoDudoso && (
            <div className="md:col-span-2">
            <label className="flex cursor-pointer items-start gap-3 rounded-[14px] border-[1.5px] border-[#f2b53d] bg-[#fdf6e3] px-4 py-3.5 text-sm">
              <input type="checkbox" name="confirmoDocumento" className="accent-lime mt-0.5 size-5 shrink-0" />
              <span className="text-charcoal leading-relaxed">Confirmo que el documento y el nombre son correctos.</span>
            </label>
            </div>
          )}
          <Campo label="Lugar de nacimiento" name="lugarNacimiento" error={fe.lugarNacimiento}><Input id="lugarNacimiento" name="lugarNacimiento" placeholder="Ciudad" className={INPUT} /></Campo>
          <Campo label="EPS" name="eps" error={fe.eps}><Input id="eps" name="eps" required placeholder="Sura, Nueva EPS, Salud Total…" className={INPUT} /></Campo>
          <Campo label="RH (grupo sanguíneo)" name="rh" error={fe.rh}>
            <Select id="rh" name="rh" defaultValue="">
              <option value="">—</option>
              {RH_VALORES.map((v) => <option key={v} value={v}>{v}</option>)}
            </Select>
          </Campo>
          <fieldset className="space-y-1.5">
            <legend className="text-[13px] font-semibold text-charcoal">Deporte</legend>
            <div className="grid grid-cols-2 gap-2.5 pt-1.5">
              {([["tenis", "Tenis"], ["padel", "Pádel"]] as const).map(([v, t]) => (
                <label key={v} className="has-[:checked]:bg-stadium has-[:checked]:text-primary has-[:checked]:border-stadium flex h-12 cursor-pointer items-center justify-center gap-2 rounded-[10px] border-[1.5px] text-[15px] font-semibold text-charcoal transition-colors">
                  <input type="checkbox" name="deportes" value={v} className="peer sr-only" />
                  <svg className="hidden size-[18px] peer-checked:block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden><path d="M20 6L9 17l-5-5" /></svg>
                  {t}
                </label>
              ))}
            </div>
          </fieldset>
          </div>
        </section>

        {/* Paso 2 · Contacto */}
        <section data-paso="familia" hidden={actual !== "familia"} className="space-y-5">
          <Encabezado pregunta={mayor ? "¿Cómo te contactamos?" : "¿Cómo contactamos a la familia?"} />
          <div className="grid gap-5 md:grid-cols-2">
          <div className="md:col-span-2"><Campo label="Dirección de residencia" name="direccion" error={fe.direccion}><Input id="direccion" name="direccion" autoComplete="street-address" placeholder="Calle, número, barrio" className={INPUT} /></Campo></div>
          {mayor && (
            <>
              <Campo label="Celular" name="celular" error={fe.celular}><Input id="celular" name="celular" inputMode="tel" required autoComplete="tel" className={INPUT} placeholder="300 000 0000" /></Campo>
              <Campo label="Correo" name="email" error={fe.email}><Input id="email" name="email" type="email" required autoComplete="email" className={INPUT} placeholder="nombre@correo.com" /></Campo>
            </>
          )}
          <div className="bg-border h-px md:col-span-2" />
          <span className="text-muted-foreground block text-xs font-bold uppercase tracking-[0.1em] md:col-span-2">Contacto de emergencia</span>
          <Campo label="Nombre" name="emergenciaNombre" error={fe.emergenciaNombre}><Input id="emergenciaNombre" name="emergenciaNombre" className={INPUT} /></Campo>
          <div className="grid grid-cols-[1fr_120px] gap-3">
            <Campo label="Celular" name="emergenciaCelular" error={fe.emergenciaCelular}><Input id="emergenciaCelular" name="emergenciaCelular" inputMode="tel" className={INPUT} placeholder="300 000 0000" /></Campo>
            <Campo label="Parentesco" name="emergenciaParentesco" error={fe.emergenciaParentesco}><Input id="emergenciaParentesco" name="emergenciaParentesco" placeholder="Tío, abuela…" className={INPUT} /></Campo>
          </div>
          </div>
        </section>

        {/* Paso 3 · Acudientes (solo menores) */}
        {!mayor && (
          <section data-paso="acudientes" hidden={actual !== "acudientes"} className="space-y-5">
            <Encabezado pregunta="¿Quién responde por el deportista?" detalle="Escribe los datos del padre, de la madre o del familiar que está a cargo. Esta persona firma el consentimiento y recibe la información del club." />
            <input type="hidden" name="acudientesVisibles" value="1" />
            <Acudiente errores={fe} inicial={firmante ? { ...firmante, rol: firmante.parentesco === "Madre" ? "madre" : firmante.parentesco === "Padre" ? "padre" : "otro" } : undefined} />
          </section>
        )}

        {/* Paso 4 · Facturación (obligatoria) */}
        <section data-paso="facturacion" hidden={actual !== "facturacion"} className="space-y-5">
          <Encabezado pregunta="¿A nombre de qué persona o empresa debe el centro deportivo emitir las facturas?" />
          <input type="hidden" name="facturaDe" value={elegida.valor} />
          {fe.facturaDe && <p className="text-destructive text-sm">{fe.facturaDe}</p>}
          <div className="grid gap-5 md:grid-cols-2 md:items-start">
          <div className="space-y-2.5" role="radiogroup" aria-label="A nombre de quién salen las facturas">
            {opciones.map((o) => {
              const on = o.valor === elegida.valor;
              return (
                <label key={o.valor} className={cn("flex cursor-pointer items-start gap-3.5 rounded-[14px] border-[1.5px] px-4 py-3.5 transition-colors", on ? "border-stadium border-2" : "border-input")}>
                  <input type="radio" name="facturaDeOpcion" value={o.valor} checked={on} onChange={() => setFacturaDe(o.valor)} className="accent-stadium mt-0.5 size-5 shrink-0" />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-[15px] font-bold">{o.titulo}</span>
                    {o.sub && <span className={cn("text-[13px] font-semibold", on ? "text-[#46530a]" : "text-muted-foreground")}>{o.sub}</span>}
                    {o.detalle && <span className="text-muted-foreground truncate text-xs">{o.detalle}</span>}
                  </span>
                </label>
              );
            })}
          </div>

          {esOtro ? (
            <div className="space-y-4 rounded-[14px] border-[1.5px] p-4">
              <div className="grid grid-cols-[136px_1fr] gap-3">
                <Campo label="Tipo" name="facturaTipo" error={fe.facturaTipo}>
                  <Select id="facturaTipo" name="facturaTipo" value={otro.tipo} onChange={(e) => setOtro({ ...otro, tipo: e.target.value })}>
                    <option value="natural">Natural</option>
                    <option value="juridica">Jurídica</option>
                  </Select>
                </Campo>
                <Campo label="NIT o cédula" name="facturaANit" error={fe.facturaANit}>
                  <Input id="facturaANit" name="facturaANit" inputMode="numeric" required value={otro.nit} onChange={(e) => setOtro({ ...otro, nit: e.target.value })} className={INPUT} placeholder="Sin puntos" />
                </Campo>
              </div>
              <Campo label="Nombre o razón social" name="facturaANombre" error={fe.facturaANombre}>
                <Input id="facturaANombre" name="facturaANombre" required value={otro.nombre} onChange={(e) => setOtro({ ...otro, nombre: e.target.value })} className={INPUT} />
              </Campo>
              <Campo label="Correo para las facturas" name="facturaEmail" error={fe.facturaEmail}>
                <Input id="facturaEmail" name="facturaEmail" type="email" required value={otro.email} onChange={(e) => setOtro({ ...otro, email: e.target.value })} className={INPUT} placeholder="nombre@correo.com" />
              </Campo>
            </div>
          ) : (
            <div className="bg-background space-y-2.5 rounded-[14px] px-4 py-4">
              <input type="hidden" name="facturaTipo" value="natural" />
              <input type="hidden" name="facturaANombre" value={elegida.datos?.nombre ?? ""} />
              <input type="hidden" name="facturaANit" value={elegida.datos?.nit ?? ""} />
              <input type="hidden" name="facturaEmail" value={elegida.datos?.email ?? ""} />
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-[11px] font-bold uppercase tracking-[0.12em]">Así quedará la factura</span>
                <button type="button" onClick={editarComoOtro} className="text-[#46530a] text-[13px] font-semibold hover:underline">Editar</button>
              </div>
              <dl className="grid grid-cols-[96px_1fr] gap-y-2 text-sm">
                <dt className="text-muted-foreground">Nombre</dt><dd className="font-semibold">{elegida.datos?.nombre || "—"}</dd>
                <dt className="text-muted-foreground">Cédula / NIT</dt><dd className="font-semibold">{elegida.datos?.nit || "—"}</dd>
                <dt className="text-muted-foreground">Correo</dt><dd className="truncate font-semibold">{elegida.datos?.email || "—"}</dd>
                <dt className="text-muted-foreground">Tipo</dt><dd className="font-semibold">Persona natural</dd>
              </dl>
              {(fe.facturaANombre || fe.facturaANit || fe.facturaEmail) && (
                <p className="text-destructive text-sm">{fe.facturaANombre || fe.facturaANit || fe.facturaEmail}. Pulsa Editar para completarlo.</p>
              )}
            </div>
          )}
          </div>

          <label className="bg-background flex cursor-pointer items-start gap-3 rounded-[14px] px-4 py-3.5 text-sm">
            <input type="checkbox" name="acepto_datos" required className="accent-lime mt-0.5 size-5" />
            <span className="text-charcoal leading-relaxed">Autorizo al Centro Deportivo Alejandro Falla el tratamiento de estos datos para la gestión de las actividades deportivas, conforme a la Ley 1581 de 2012.</span>
          </label>
          {fe.acepto_datos && <p className="text-destructive text-sm">{fe.acepto_datos}</p>}
        </section>

        {/* Botones */}
        <div className="mt-6 space-y-3 md:flex md:flex-row-reverse md:items-center md:justify-between md:space-y-0">
          {/* Dos botones con `key` distinta: si React reutilizara el mismo nodo, el clic de "Continuar"
              en el penúltimo paso terminaría como envío del formulario (el nodo ya sería type="submit"
              cuando el navegador ejecuta la acción por defecto del clic). */}
          {ultimo ? (
            <Button key="enviar" type="submit" size="lg" disabled={pending} className="h-[54px] w-full rounded-xl text-base font-bold shadow-lg shadow-primary/25 md:w-auto md:min-w-72 md:px-8">
              {pending ? "Guardando…" : "Guardar y pasar a firmar"} {!pending && <ArrowRight className="size-[18px]" />}
            </Button>
          ) : (
            <Button key="continuar" type="button" size="lg" onClick={continuar} className="h-[54px] w-full rounded-xl text-base font-bold shadow-lg shadow-primary/25 md:w-auto md:min-w-72 md:px-8">
              Continuar <ArrowRight className="size-[18px]" />
            </Button>
          )}
          {paso > 0 && (
            <button type="button" onClick={volver} className="text-muted-foreground block w-full text-center text-sm font-semibold hover:underline md:w-auto">← Volver al paso {paso}</button>
          )}
        </div>
      </div>
    </form>
  );
}
