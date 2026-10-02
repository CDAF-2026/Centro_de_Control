"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ArrowRight, ChevronDown, Info, Plus } from "lucide-react";
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

function Encabezado({ pregunta, detalle }: { pregunta: string; detalle: string }) {
  return (
    <div className="space-y-1.5">
      <h2 className="font-heading text-[22px] font-extrabold tracking-tight">{pregunta}</h2>
      <p className="text-muted-foreground text-sm leading-relaxed">{detalle}</p>
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

function Acudiente({ prefijo, titulo, etiqueta, obligatorio, inicial, errores }: {
  prefijo: "acudiente" | "acudiente2"; titulo: string; etiqueta: string; obligatorio: boolean;
  inicial?: Partial<Firmante> & { rol?: string }; errores: Record<string, string>;
}) {
  const n = (c: string) => `${prefijo}${c}`;
  const [rol, setRol] = useState(inicial?.rol ?? (prefijo === "acudiente" ? "madre" : "padre"));
  return (
    <div className="space-y-4 rounded-[14px] border-[1.5px] p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold">{titulo}</span>
        <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-bold", obligatorio ? "bg-primary/25 text-[#46530a]" : "bg-muted text-muted-foreground")}>{etiqueta}</span>
      </div>
      <input type="hidden" name={n("Rol")} value={rol} />
      <div className="bg-muted grid grid-cols-3 gap-1 rounded-[10px] p-1" role="radiogroup" aria-label="Es">
        {([["madre", "Madre"], ["padre", "Padre"], ["otro", "Otro"]] as const).map(([v, t]) => (
          <button key={v} type="button" role="radio" aria-checked={rol === v} onClick={() => setRol(v)}
            className={cn("h-10 rounded-lg text-sm font-semibold transition-colors", rol === v ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}>{t}</button>
        ))}
      </div>
      <Campo label="Nombre completo" name={n("Nombre")} error={errores[n("Nombre")]}>
        <Input id={n("Nombre")} name={n("Nombre")} required={obligatorio} defaultValue={inicial?.nombre ?? ""} autoComplete="name" className={INPUT} placeholder="Nombre y apellidos" />
      </Campo>
      <Campo label="Cédula" name={n("Documento")} error={errores[n("Documento")]}>
        <Input id={n("Documento")} name={n("Documento")} inputMode="numeric" required={obligatorio} defaultValue={inicial?.documento ?? ""} className={INPUT} placeholder="Sin puntos" />
      </Campo>
      <Campo label="Celular" name={n("Telefono")} error={errores[n("Telefono")]}>
        <Input id={n("Telefono")} name={n("Telefono")} inputMode="tel" required={obligatorio} defaultValue={inicial?.celular ?? ""} autoComplete="tel" className={INPUT} placeholder="300 000 0000" />
      </Campo>
      <Campo label="Correo" name={n("Email")} error={errores[n("Email")]} hint={obligatorio ? "Aquí llegan los correos del club." : undefined}>
        <Input id={n("Email")} name={n("Email")} type="email" required={obligatorio} defaultValue={inicial?.email ?? ""} autoComplete="email" className={INPUT} placeholder="nombre@correo.com" />
      </Campo>
      {rol === "otro" && (
        <Campo label="Parentesco" name={n("Parentesco")}>
          <Input id={n("Parentesco")} name={n("Parentesco")} defaultValue={inicial?.parentesco ?? ""} placeholder="Abuela, tío…" className={INPUT} />
        </Campo>
      )}
    </div>
  );
}

type Snap = Record<string, string>;
type OpcionFactura = { valor: "acudiente" | "acudiente2" | "propio" | "otro"; titulo: string; sub?: string; detalle: string; datos?: { nombre: string; nit: string; email: string } };

/** Las opciones de "¿a nombre de quién salen las facturas?", armadas con lo escrito en los pasos anteriores. */
function opcionesFactura(snap: Snap, mayor: boolean): OpcionFactura[] {
  const rol = (r: string) => (r === "madre" ? "Madre" : r === "padre" ? "Padre" : "Acudiente");
  const ops: OpcionFactura[] = [];
  if (mayor) {
    const nombre = `${snap.nombres ?? ""} ${snap.apellidos ?? ""}`.trim();
    ops.push({ valor: "propio", titulo: nombre || "A mi nombre", sub: "A mi nombre", detalle: [snap.tipoDocumento && snap.documento ? `${snap.tipoDocumento} ${snap.documento}` : "", snap.email ?? ""].filter(Boolean).join(" · "), datos: { nombre, nit: snap.documento ?? "", email: snap.email ?? "" } });
  } else {
    ops.push({ valor: "acudiente", titulo: snap.acudienteNombre || "Acudiente principal", sub: `${rol(snap.acudienteRol ?? "")} · acudiente principal`, detalle: [snap.acudienteDocumento ? `CC ${snap.acudienteDocumento}` : "", snap.acudienteEmail ?? ""].filter(Boolean).join(" · "), datos: { nombre: snap.acudienteNombre ?? "", nit: snap.acudienteDocumento ?? "", email: snap.acudienteEmail ?? "" } });
    if (snap.acudiente2Nombre?.trim()) {
      ops.push({ valor: "acudiente2", titulo: snap.acudiente2Nombre, sub: `${rol(snap.acudiente2Rol ?? "")} · segundo acudiente`, detalle: [snap.acudiente2Documento ? `CC ${snap.acudiente2Documento}` : "", snap.acudiente2Email ?? ""].filter(Boolean).join(" · "), datos: { nombre: snap.acudiente2Nombre, nit: snap.acudiente2Documento ?? "", email: snap.acudiente2Email ?? "" } });
    }
  }
  ops.push({ valor: "otro", titulo: "Otra persona o empresa", detalle: "Escribes el NIT o cédula, la razón social y el correo." });
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
 * (un acudiente, uno mismo si es mayor, u otra persona o empresa) y los campos viajan
 * llenos siempre; el servidor los exige.
 */
export function DatosForm({ firmante }: { firmante?: Firmante | null }) {
  const [state, action, pending] = useActionState<DatosState, FormData>(enviarDatos, {});
  const fe = state.fieldErrors ?? {};
  const formRef = useRef<HTMLFormElement>(null);
  const [fecha, setFecha] = useState("");
  const [tipoDoc, setTipoDoc] = useState("");
  const [segundo, setSegundo] = useState(false);
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

  const continuar = () => {
    if (!pasoValido(actual)) return;
    tomarFoto();
    if (pasos[paso + 1] === "facturacion" && !facturaDe) setFacturaDe(mayor ? "propio" : "acudiente");
    setPaso(paso + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const volver = () => { setPaso(Math.max(0, paso - 1)); window.scrollTo({ top: 0, behavior: "smooth" }); };

  // Al enviar, un campo inválido en un paso OCULTO bloquearía el envío sin aviso
  // (el navegador no puede enfocarlo): se busca y se salta a ese paso.
  const alEnviar = (e: React.FormEvent<HTMLFormElement>) => {
    for (let i = 0; i < pasos.length; i++) {
      if (pasos[i] === actual) continue;
      const sec = formRef.current?.querySelector<HTMLElement>(`[data-paso="${pasos[i]}"]`);
      const malo = sec && Array.from(sec.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select")).find((el) => !el.checkValidity());
      if (malo) { e.preventDefault(); setPaso(i); setTimeout(() => malo.reportValidity(), 50); return; }
    }
  };

  const opciones = opcionesFactura(snap, mayor);
  const elegida = opciones.find((o) => o.valor === facturaDe) ?? opciones[0];
  const esOtro = elegida.valor === "otro";
  const editarComoOtro = () => {
    if (elegida.datos) setOtro({ tipo: "natural", nombre: elegida.datos.nombre, nit: elegida.datos.nit, email: elegida.datos.email });
    setFacturaDe("otro");
  };

  return (
    <form ref={formRef} action={action} onSubmit={alEnviar} className="flex flex-col">
      <div className="absolute -left-[9999px] top-0" aria-hidden>
        <label>Sitio web <input type="text" name="sitio_web" tabIndex={-1} autoComplete="off" /></label>
      </div>

      {/* Barra de pasos, sobre el fondo oscuro */}
      <div className="mb-4 space-y-3">
        <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${pasos.length}, minmax(0, 1fr))` }} aria-hidden>
          {pasos.map((p, i) => <div key={p} className={cn("h-[5px] rounded-full", i <= paso ? "bg-primary" : "bg-white/20")} />)}
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-primary text-[11px] font-bold uppercase tracking-[0.14em]">Paso {Math.min(paso, pasos.length - 1) + 1} de {pasos.length} · {TITULO[actual]}</span>
          <span className="text-xs text-white/55">{ultimo ? "Último paso" : "≈ 4 minutos en total"}</span>
        </div>
      </div>

      <div className="bg-card rounded-[20px] p-6 shadow-xl ring-1 ring-white/5 md:p-7">
        {state.error && (
          <p role="alert" className="border-destructive/20 bg-destructive/5 text-destructive mb-5 rounded-lg border px-3 py-2 text-sm">{state.error}</p>
        )}

        {/* Paso 1 · El deportista */}
        <section data-paso="deportista" hidden={actual !== "deportista"} className="space-y-5">
          <Encabezado pregunta="¿A quién vas a registrar?" detalle="Escribe los datos de tu hijo o hija tal como aparecen en su documento de identidad." />
          <Campo label="Nombres" name="nombres" error={fe.nombres}><Input id="nombres" name="nombres" required className={INPUT} autoComplete="off" /></Campo>
          <Campo label="Apellidos" name="apellidos" error={fe.apellidos}><Input id="apellidos" name="apellidos" required className={INPUT} autoComplete="off" /></Campo>
          <Campo label="Fecha de nacimiento" name="fechaNacimiento" error={fe.fechaNacimiento}>
            <Input id="fechaNacimiento" name="fechaNacimiento" type="date" required value={fecha} onChange={(e) => alCambiarFecha(e.target.value)} className={INPUT} />
            {edad != null && edad >= 0 && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="bg-primary/25 rounded-full px-2.5 py-1 text-xs font-bold text-[#46530a]">{edad} años · {mayor ? "mayor de edad" : "menor de edad"}</span>
                <span className="text-muted-foreground text-xs">{mayor ? "Firmas por ti mismo(a)." : "Por eso pediremos a su acudiente."}</span>
              </div>
            )}
          </Campo>
          <div className="grid grid-cols-[110px_1fr] gap-3">
            <Campo label="Tipo" name="tipoDocumento" error={fe.tipoDocumento}>
              <Select id="tipoDocumento" name="tipoDocumento" required value={tipoDoc} onChange={(e) => setTipoDoc(e.target.value)}>
                <option value="">—</option>
                {TIPOS_DOCUMENTO.filter((t) => t.valor !== "NIT").map((t) => <option key={t.valor} value={t.valor}>{t.valor}</option>)}
              </Select>
            </Campo>
            <Campo label="Número de documento" name="documento" error={fe.documento}>
              <Input id="documento" name="documento" inputMode="numeric" required className={INPUT} placeholder="Sin puntos" />
            </Campo>
          </div>
          <Campo label="Lugar de nacimiento" name="lugarNacimiento" error={fe.lugarNacimiento}><Input id="lugarNacimiento" name="lugarNacimiento" placeholder="Ciudad" className={INPUT} /></Campo>
          <Campo label="EPS" name="eps" error={fe.eps} hint="Aparece en el consentimiento que vas a firmar."><Input id="eps" name="eps" required placeholder="Sura, Nueva EPS, Salud Total…" className={INPUT} /></Campo>
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
            <p className="text-muted-foreground text-xs">Puedes marcar los dos.</p>
          </fieldset>
        </section>

        {/* Paso 2 · Contacto */}
        <section data-paso="familia" hidden={actual !== "familia"} className="space-y-5">
          <Encabezado pregunta={mayor ? "¿Cómo te contactamos?" : "¿Cómo contactamos a la familia?"} detalle={mayor ? "Tu celular, tu correo y a quién llamar en una emergencia." : "Dónde viven y a quién llamar en una emergencia."} />
          <Campo label="Dirección de residencia" name="direccion" error={fe.direccion}><Input id="direccion" name="direccion" autoComplete="street-address" placeholder="Calle, número, barrio" className={INPUT} /></Campo>
          {mayor && (
            <>
              <Campo label="Celular" name="celular" error={fe.celular}><Input id="celular" name="celular" inputMode="tel" required autoComplete="tel" className={INPUT} placeholder="300 000 0000" /></Campo>
              <Campo label="Correo" name="email" error={fe.email} hint="Aquí llegan los correos del club."><Input id="email" name="email" type="email" required autoComplete="email" className={INPUT} placeholder="nombre@correo.com" /></Campo>
            </>
          )}
          <div className="bg-border h-px" />
          <span className="text-muted-foreground block text-xs font-bold uppercase tracking-[0.1em]">Contacto de emergencia</span>
          <Campo label="Nombre" name="emergenciaNombre" error={fe.emergenciaNombre}><Input id="emergenciaNombre" name="emergenciaNombre" placeholder="Quién contesta si pasa algo" className={INPUT} /></Campo>
          <div className="grid grid-cols-[1fr_120px] gap-3">
            <Campo label="Celular" name="emergenciaCelular" error={fe.emergenciaCelular}><Input id="emergenciaCelular" name="emergenciaCelular" inputMode="tel" className={INPUT} placeholder="300 000 0000" /></Campo>
            <Campo label="Parentesco" name="emergenciaParentesco" error={fe.emergenciaParentesco}><Input id="emergenciaParentesco" name="emergenciaParentesco" placeholder="Tío, abuela…" className={INPUT} /></Campo>
          </div>
        </section>

        {/* Paso 3 · Acudientes (solo menores) */}
        {!mayor && (
          <section data-paso="acudientes" hidden={actual !== "acudientes"} className="space-y-5">
            <Encabezado pregunta="¿Quién responde por el deportista?" detalle={`${edad != null ? `Tiene ${edad} años. ` : ""}Al menos un padre, madre o acudiente. El principal es quien firma y recibe los correos del club.`} />
            <input type="hidden" name="acudientesVisibles" value="1" />
            <Acudiente prefijo="acudiente" titulo="Acudiente principal" etiqueta="Quien diligencia" obligatorio errores={fe}
              inicial={firmante ? { ...firmante, rol: firmante.parentesco === "Madre" ? "madre" : firmante.parentesco === "Padre" ? "padre" : "otro" } : undefined} />
            {segundo ? (
              <Acudiente prefijo="acudiente2" titulo="Segundo acudiente" etiqueta="Opcional" obligatorio={false} errores={fe} />
            ) : (
              <button type="button" onClick={() => setSegundo(true)} className="text-charcoal flex h-[50px] w-full items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed text-sm font-semibold">
                <Plus className="size-[18px]" /> Agregar segundo acudiente <span className="text-muted-foreground font-normal">(opcional)</span>
              </button>
            )}
          </section>
        )}

        {/* Paso 4 · Facturación (obligatoria) */}
        <section data-paso="facturacion" hidden={actual !== "facturacion"} className="space-y-5">
          <Encabezado pregunta="¿A nombre de quién salen las facturas?" detalle="El club factura electrónicamente cada pago. Este dato es obligatorio." />
          <input type="hidden" name="facturaDe" value={elegida.valor} />
          {fe.facturaDe && <p className="text-destructive text-sm">{fe.facturaDe}</p>}
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
              <p className="text-muted-foreground flex items-start gap-1.5 text-xs"><Info className="mt-0.5 size-3.5 shrink-0" />Tomado de lo que escribiste en el paso anterior. Si la ficha ya tenía otro NIT, el club confirma el cambio antes de aplicarlo.</p>
            </div>
          )}

          <label className="bg-background flex cursor-pointer items-start gap-3 rounded-[14px] px-4 py-3.5 text-sm">
            <input type="checkbox" name="acepto_datos" required className="accent-lime mt-0.5 size-5" />
            <span className="text-charcoal leading-relaxed">Autorizo al Centro Deportivo Alejandro Falla el tratamiento de estos datos para la gestión de las actividades deportivas, conforme a la Ley 1581 de 2012.</span>
          </label>
          {fe.acepto_datos && <p className="text-destructive text-sm">{fe.acepto_datos}</p>}
        </section>

        {/* Botones */}
        <div className="mt-6 space-y-3">
          {ultimo ? (
            <Button type="submit" size="lg" disabled={pending} className="h-[54px] w-full rounded-xl text-base font-bold shadow-lg shadow-primary/25">
              {pending ? "Guardando…" : "Guardar y pasar a firmar"} {!pending && <ArrowRight className="size-[18px]" />}
            </Button>
          ) : (
            <Button type="button" size="lg" onClick={continuar} className="h-[54px] w-full rounded-xl text-base font-bold shadow-lg shadow-primary/25">
              Continuar <ArrowRight className="size-[18px]" />
            </Button>
          )}
          {paso > 0 && (
            <button type="button" onClick={volver} className="text-muted-foreground block w-full text-center text-sm font-semibold hover:underline">← Volver al paso {paso}</button>
          )}
        </div>
      </div>
      <p className="mt-4 text-center text-xs text-white/45">Tus datos se guardan al final, cuando firmas.</p>
    </form>
  );
}
