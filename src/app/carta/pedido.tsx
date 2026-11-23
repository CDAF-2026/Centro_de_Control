"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import Image from "next/image";
import { ArrowLeft, Check, ChevronDown, LayoutGrid, Minus, Plus, Search, Send, UtensilsCrossed, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { filtrar, sinTildes, sugerir, type Sugerencia } from "@/lib/cafeteria/buscar";
import type { CategoriaCarta, ProductoCarta } from "@/lib/cafeteria/carta";
import { IconoFruta, frutaDe } from "./icono-fruta";
import {
  MAX_POR_LINEA,
  claveLinea,
  codigoPedido,
  enlaceWhatsApp,
  indexar,
  lineasValidas,
  mensajeWhatsApp,
  nombreLinea,
  pesos,
  subtotal,
  tituloPedido,
  total,
  unidades,
  type DatosPedido,
  type Linea,
  type Productos,
} from "@/lib/cafeteria/pedido";

/*
 * La carta del comprador, diseño aprobado por Laura el 20-nov-2026 (lienzo
 * "Carta del comprador", fila "Categorías en cuadrícula"):
 *   · TODO en una sola página: arriba las categorías en cuadros grandes con
 *     foto, debajo la carta completa por secciones. Tocar un cuadro baja a su
 *     sección.
 *   · Abajo, fijo, el botón "Categorías" (abre la misma cuadrícula como hoja,
 *     desde cualquier punto) junto a "Mi pedido".
 *   · El buscador filtra la carta mientras se escribe y además SUGIERE debajo
 *     del campo (autocompletar, pedido de Laura el mismo día).
 *   · Sin conteos de productos, sin letrero de zona y sin forma de pago: dónde
 *     está la persona lo ESCRIBE al final.
 */
const CARD = "bg-card rounded-[18px] shadow-[0_1px_2px_rgba(26,28,30,0.06),0_4px_12px_rgba(26,28,30,0.05)]";
const TITULO = "font-heading font-extrabold uppercase italic";
const INPUT = "h-12 rounded-xl border-[1.5px] px-3.5 text-[15px] md:text-[15px]";
const CTA = "bg-stadium text-primary hover:bg-stadium/90 flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl text-base font-bold transition active:translate-y-px disabled:opacity-60";

type Paso = "carta" | "datos" | "enviado";
type Carrito = Record<string, Linea>;
type Enviado = { codigo: string; enlace: string };
type Errores = Partial<Record<keyof DatosPedido, string>>;
type Cantidad = (productoId: number, opcion?: string) => number;
type Cambiar = (productoId: number, opcion: string | undefined, delta: number) => void;

/** Por pestaña: si la persona vuelve de WhatsApp o recarga, encuentra su pedido como lo dejó. */
const GUARDADO = "cdaf-carta-pedido";
/** Entre visitas: el nombre, para no volver a escribirlo en el próximo pedido. */
const NOMBRE = "cdaf-carta-nombre";

const DATOS_VACIOS: DatosPedido = { nombre: "", ubicacion: "", detalleUbicacion: "", notas: "" };

const texto = (v: unknown) => (typeof v === "string" ? v : "");
const idSeccion = (categoriaId: number) => `categoria-${categoriaId}`;

function aCarrito(lineas: Linea[], productos: Productos): Carrito {
  return Object.fromEntries(lineasValidas(lineas, productos).map((l) => [claveLinea(l.productoId, l.opcion), l]));
}

export function Pedido({
  categorias,
  whatsapp,
}: {
  /** Solo lo disponible: el servidor ya quitó lo demás. */
  categorias: CategoriaCarta[];
  whatsapp: string;
}) {
  const productos = useMemo(() => indexar(categorias), [categorias]);
  const [paso, setPaso] = useState<Paso>("carta");
  const [busqueda, setBusqueda] = useState("");
  /** La hoja de categorías abierta, con la categoría que se estaba viendo al abrirla. */
  const [hoja, setHoja] = useState<{ aqui: number | null } | null>(null);
  const [carrito, setCarrito] = useState<Carrito>({});
  const [datos, setDatos] = useState<DatosPedido>(DATOS_VACIOS);
  const [errores, setErrores] = useState<Errores>({});
  const [enviado, setEnviado] = useState<Enviado | null>(null);
  const [cargado, setCargado] = useState(false);
  const [ampliada, setAmpliada] = useState<ProductoCarta | null>(null);

  // Se lee lo guardado después de montar (en el servidor no hay sessionStorage). Lo que
  // ya no esté en la carta (se apagó o se eliminó mientras tanto) se cae solo del carrito
  // al pasar por `aCarrito`. Los datos se leen campo por campo: un pedido guardado con la
  // forma vieja (zona de lista, forma de pago) no arrastra nada raro.
  // Tiene que ser un efecto: leerlo al crear el estado pintaría distinto en el servidor
  // y en el navegador, y React descartaría la pantalla.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const guardado = JSON.parse(sessionStorage.getItem(GUARDADO) ?? "null");
      const nombre = localStorage.getItem(NOMBRE) ?? "";
      if (guardado) {
        const d = guardado.datos ?? {};
        setCarrito(aCarrito(Object.values(guardado.carrito ?? {}), productos));
        setDatos({
          nombre: texto(d.nombre) || nombre,
          ubicacion: texto(d.ubicacion),
          detalleUbicacion: texto(d.detalleUbicacion),
          notas: texto(d.notas),
        });
        if (guardado.enviado) {
          setEnviado(guardado.enviado);
          setPaso("enviado");
        } else if (guardado.paso === "datos") {
          setPaso("datos");
        }
      } else if (nombre) {
        setDatos((actual) => ({ ...actual, nombre }));
      }
    } catch {
      // Navegación privada o almacenamiento bloqueado: la página funciona igual, sin recordar.
    }
    setCargado(true);
  }, [productos]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!cargado) return;
    guardar({ carrito, datos, paso, enviado });
  }, [cargado, carrito, datos, paso, enviado]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [paso]);

  const lineas = useMemo(() => Object.values(carrito), [carrito]);
  const cantidad: Cantidad = (productoId, opcion) => carrito[claveLinea(productoId, opcion)]?.cantidad ?? 0;

  const cambiar: Cambiar = (productoId, opcion, delta) =>
    setCarrito((actual) => {
      const clave = claveLinea(productoId, opcion);
      const nueva = Math.min(MAX_POR_LINEA, (actual[clave]?.cantidad ?? 0) + delta);
      const resto = { ...actual };
      delete resto[clave];
      return nueva > 0 ? { ...actual, [clave]: { productoId, opcion, cantidad: nueva } } : resto;
    });

  const cambiarDato = <K extends keyof DatosPedido>(campo: K, valor: DatosPedido[K]) => {
    setDatos((d) => ({ ...d, [campo]: valor }));
    setErrores((e) => ({ ...e, [campo]: undefined }));
  };

  const enviar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const faltan: Errores = {};
    if (!datos.nombre.trim()) faltan.nombre = "Escribe tu nombre para que te encuentren.";
    if (!datos.ubicacion.trim()) faltan.ubicacion = "Escribe dónde estás para llevártelo.";
    setErrores(faltan);
    if (Object.keys(faltan).length > 0 || lineas.length === 0) return;

    const codigo = codigoPedido();
    const enlace = enlaceWhatsApp(whatsapp, mensajeWhatsApp(lineas, datos, productos));

    // El registro no detiene el pedido: `keepalive` lo deja terminar aunque la página se
    // vaya a WhatsApp, y se navega en el mismo toque para que el celular abra la app.
    fetch("/carta/pedidos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codigo, lineas, datos }),
      keepalive: true,
    }).catch(() => {});

    try {
      localStorage.setItem(NOMBRE, datos.nombre.trim());
    } catch {}
    // Se guarda ya (sin esperar al efecto): la navegación puede descargar la página antes.
    guardar({ carrito, datos, paso: "enviado", enviado: { codigo, enlace } });
    setEnviado({ codigo, enlace });
    setPaso("enviado");
    window.location.href = enlace;
  };

  const otroPedido = () => {
    setCarrito({});
    setEnviado(null);
    // El nombre y dónde está se conservan: lo normal es que siga en el mismo sitio.
    setDatos((d) => ({ ...d, detalleUbicacion: "", notas: "" }));
    setBusqueda("");
    setPaso("carta");
  };

  /** Abre la hoja y marca la sección que la persona tiene a la vista. */
  const abrirCategorias = () => {
    let aqui: number | null = null;
    for (const c of categorias) {
      const seccion = document.getElementById(idSeccion(c.id));
      if (seccion && seccion.getBoundingClientRect().top <= window.innerHeight * 0.4) aqui = c.id;
    }
    setHoja({ aqui });
  };

  /**
   * Baja a la sección de una categoría. Antes hay que quitar la búsqueda (con ella
   * puesta la sección puede no estar en la página) y cerrar la hoja; `flushSync`
   * hace que eso ya esté pintado cuando se busca la sección.
   */
  const irACategoria = (id: number) => {
    flushSync(() => {
      setBusqueda("");
      setHoja(null);
    });
    document.getElementById(idSeccion(id))?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const verPedido = () => {
    setHoja(null);
    setPaso("datos");
  };

  if (paso === "enviado" && enviado) {
    return (
      <div className="flex flex-1 flex-col gap-3 px-4 pt-4">
        <Encabezado />
        <section className={cn(CARD, "space-y-5 p-6 text-center")}>
          <div className="bg-primary/15 ring-primary/25 mx-auto flex size-16 items-center justify-center rounded-full ring-1">
            <Check className="size-8 text-[#46530a]" strokeWidth={2.6} />
          </div>
          <div className="space-y-2">
            <p className="font-heading text-muted-foreground text-[11px] font-bold tracking-wide uppercase">{tituloPedido(datos.nombre)}</p>
            <h2 className={cn(TITULO, "text-xl leading-tight")}>¡Ya casi!</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Abrimos WhatsApp con tu pedido escrito. <strong className="text-foreground">Toca Enviar</strong> para que llegue a la cafetería. Si no se abrió, usa el botón.
            </p>
          </div>
          <a href={enviado.enlace} className={CTA}>
            <Send className="size-5" /> Abrir WhatsApp
          </a>
          <button type="button" onClick={otroPedido} className="text-charcoal text-sm font-semibold hover:underline">
            Hacer otro pedido
          </button>
        </section>
        <p className="text-muted-foreground px-2 text-center text-xs leading-relaxed">La cafetería te confirma por WhatsApp cuando tu pedido vaya en camino.</p>
      </div>
    );
  }

  if (paso === "datos") {
    return (
      <form onSubmit={enviar} noValidate className="flex flex-1 flex-col gap-3.5 px-4 pt-4">
        <button type="button" onClick={() => setPaso("carta")} className="text-charcoal flex h-11 items-center gap-1.5 self-start text-sm font-bold">
          <ArrowLeft className="size-4" /> Seguir pidiendo
        </button>

        <section className={cn(CARD, "overflow-hidden")}>
          <h2 className={cn(TITULO, "px-4 pt-4 pb-3 text-[19px]")}>Tu pedido</h2>
          {lineas.length === 0 ? (
            <div className="space-y-3 border-t border-[#eef1f2] px-4 py-5">
              <p className="text-muted-foreground text-sm">Tu pedido está vacío.</p>
              <button type="button" onClick={() => setPaso("carta")} className="text-sm font-semibold text-[#46530a] hover:underline">Ver la carta →</button>
            </div>
          ) : (
            <>
              <ul className="m-0 list-none p-0">
                {lineas.map((l) => {
                  const foto = productos.get(l.productoId)?.fotoUrl;
                  return (
                    <li key={claveLinea(l.productoId, l.opcion)} className="flex items-center gap-3 border-t border-[#eef1f2] px-4 py-2.5">
                      {foto && (
                        <span className="relative size-12 shrink-0 overflow-hidden rounded-[10px] border border-[#e9edef] bg-white">
                          <Image src={foto} alt="" fill sizes="48px" className="object-contain p-[3px]" />
                        </span>
                      )}
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="text-[15px] leading-snug font-semibold">{nombreLinea(l, productos)}</span>
                        <span className="text-muted-foreground text-[13px] tabular-nums">{pesos(subtotal(l, productos))}</span>
                      </span>
                      <Contador nombre={nombreLinea(l, productos)} cantidad={l.cantidad} onMas={() => cambiar(l.productoId, l.opcion, 1)} onMenos={() => cambiar(l.productoId, l.opcion, -1)} />
                    </li>
                  );
                })}
              </ul>
              <div className="flex items-baseline justify-between border-t border-[#e3e8ea] bg-[#f6f8f8] px-4 py-3.5">
                <span className="text-[13px] font-bold tracking-[0.06em] uppercase">Total</span>
                <span className="font-heading text-[22px] font-extrabold tabular-nums">{pesos(total(lineas, productos))}</span>
              </div>
            </>
          )}
        </section>

        <section className={cn(CARD, "space-y-3.5 p-4")}>
          <h2 className={cn(TITULO, "text-[19px]")}>¿A dónde te lo llevamos?</h2>
          <Campo label="Tu nombre" name="nombre" error={errores.nombre}>
            <Input id="nombre" name="nombre" autoComplete="given-name" value={datos.nombre} onChange={(e) => cambiarDato("nombre", e.target.value)} aria-invalid={!!errores.nombre} maxLength={80} className={INPUT} placeholder="Nombre" />
          </Campo>
          <Campo label="¿Dónde estás?" name="ubicacion" error={errores.ubicacion}>
            <Input id="ubicacion" name="ubicacion" autoComplete="off" value={datos.ubicacion} onChange={(e) => cambiarDato("ubicacion", e.target.value)} aria-invalid={!!errores.ubicacion} maxLength={80} className={INPUT} placeholder="Ej.: cancha de tenis 1, zona social" />
          </Campo>
          <Campo label="¿Cómo te encontramos? (opcional)" name="detalleUbicacion">
            <Input id="detalleUbicacion" name="detalleUbicacion" autoComplete="off" value={datos.detalleUbicacion} onChange={(e) => cambiarDato("detalleUbicacion", e.target.value)} maxLength={120} className={INPUT} placeholder="Ej.: banca azul, camiseta roja" />
          </Campo>
          <Campo label="Notas para la cafetería (opcional)" name="notas">
            <textarea id="notas" name="notas" rows={2} value={datos.notas} onChange={(e) => cambiarDato("notas", e.target.value)} maxLength={300}
              className="border-input placeholder:text-muted-foreground w-full resize-none rounded-xl border-[1.5px] bg-transparent px-3.5 py-3 text-[15px]"
              placeholder="Ej.: sin hielo, la empanada bien caliente" />
          </Campo>
        </section>

        <button type="submit" disabled={lineas.length === 0} className={CTA}>
          <Send className="size-[18px]" /> Enviar pedido por WhatsApp
        </button>
        <p className="text-muted-foreground px-2 text-center text-xs leading-relaxed">
          Se abrirá WhatsApp con tu pedido ya escrito: solo toca <strong className="text-foreground">Enviar</strong>.
        </p>
      </form>
    );
  }

  const n = unidades(lineas);
  const valor = pesos(total(lineas, productos));
  const buscando = busqueda.trim() !== "";
  const secciones = filtrar(categorias, busqueda);

  return (
    <div className="flex flex-1 flex-col gap-3 px-4 pt-4">
      <Encabezado />

      <Buscador valor={busqueda} categorias={categorias} onCambio={setBusqueda} onCategoria={irACategoria} />

      {!buscando && (
        <>
          <h2 className={cn(TITULO, "mt-1.5 text-[17px]")}>¿Qué se te antoja?</h2>
          <Cuadricula categorias={categorias} onElegir={irACategoria} />
        </>
      )}

      {secciones.length === 0 && (
        <div className={cn(CARD, "space-y-3 px-4 py-6 text-center")}>
          <p className="text-sm">No encontramos «{busqueda.trim()}» en la carta.</p>
          <button type="button" onClick={() => setBusqueda("")} className="text-sm font-semibold text-[#46530a] hover:underline">Ver toda la carta</button>
        </div>
      )}

      {secciones.map((c) => {
        // Si alguno de la categoría tiene foto, los demás llevan un recuadro vacío para
        // que los nombres queden alineados; si ninguno tiene, la lista va sin recuadros.
        const conFotos = c.productos.some((p) => p.fotoUrl);
        return (
          <section key={c.id} id={idSeccion(c.id)} aria-labelledby={`${idSeccion(c.id)}-titulo`} className="scroll-mt-3 space-y-3 pt-2">
            <h2 id={`${idSeccion(c.id)}-titulo`} className={cn(TITULO, "text-[17px]")}>{c.nombre}</h2>
            <div className={cn(CARD, "overflow-hidden")}>
              {c.productos.map((p) => (
                <FilaProducto key={p.id} producto={p} conFotos={conFotos} cantidad={cantidad} onCambio={cambiar} onAmpliar={setAmpliada} />
              ))}
            </div>
          </section>
        );
      })}

      {/* La barra de abajo, siempre a la mano. `data-barra-fija` le avisa al marco que deje espacio debajo. */}
      <div data-barra-fija className="from-background via-background/90 pointer-events-none fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t to-transparent px-4 pt-6 pb-[max(16px,env(safe-area-inset-bottom))]">
        <div className="pointer-events-auto mx-auto flex w-full max-w-[416px] gap-2.5">
          <button type="button" onClick={abrirCategorias} className="bg-card text-stadium flex h-[58px] shrink-0 items-center gap-2 rounded-[18px] px-4 text-sm font-bold shadow-[0_10px_24px_rgba(26,28,30,0.22)] active:translate-y-px">
            <LayoutGrid aria-hidden className="size-[18px]" /> Categorías
          </button>
          {n > 0 && <BotonPedido etiqueta="Mi pedido" unidades={n} valor={valor} onClick={verPedido} flotante />}
        </div>
      </div>

      {hoja && (
        <HojaCategorias categorias={categorias} aqui={hoja.aqui} onElegir={irACategoria} onCerrar={() => setHoja(null)}>
          {n > 0 && <BotonPedido etiqueta="Ver mi pedido" unidades={n} valor={valor} onClick={verPedido} />}
        </HojaCategorias>
      )}

      {ampliada && <FotoAmpliada producto={ampliada} onCerrar={() => setAmpliada(null)} />}
    </div>
  );
}

function guardar(estado: { carrito: Carrito; datos: DatosPedido; paso: Paso; enviado: Enviado | null }) {
  try {
    sessionStorage.setItem(GUARDADO, JSON.stringify(estado));
  } catch {}
}

/**
 * El buscador de la carta. Lo escrito filtra la lista de abajo (eso lo hace la
 * carta con `filtrar`); aquí, además, se despliegan sugerencias para no tener
 * que escribir el nombre completo:
 *   · tocar un PRODUCTO completa el campo con su nombre y la lista queda en él;
 *   · tocar una CATEGORÍA borra la búsqueda y baja a su sección.
 * Con teclado: flechas para moverse, Enter para escoger, Escape para cerrar.
 */
function Buscador({ valor, categorias, onCambio, onCategoria }: {
  valor: string;
  categorias: CategoriaCarta[];
  onCambio: (texto: string) => void;
  onCategoria: (categoriaId: number) => void;
}) {
  const [abierta, setAbierta] = useState(false);
  const [activa, setActiva] = useState(-1);
  const caja = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLInputElement>(null);
  const lista = useMemo(() => sugerir(categorias, valor), [categorias, valor]);
  const visible = abierta && lista.length > 0;
  const consulta = sinTildes(valor.trim());

  // Tocar en cualquier otra parte cierra las sugerencias (la lista filtrada sigue ahí).
  useEffect(() => {
    if (!abierta) return;
    const fuera = (e: PointerEvent) => {
      if (!caja.current?.contains(e.target as Node)) setAbierta(false);
    };
    document.addEventListener("pointerdown", fuera);
    return () => document.removeEventListener("pointerdown", fuera);
  }, [abierta]);

  const cerrar = () => {
    setAbierta(false);
    setActiva(-1);
  };

  const elegir = (s: Sugerencia) => {
    cerrar();
    // Se suelta el campo para que el teclado del celular baje y se vea el resultado.
    campo.current?.blur();
    if (s.tipo === "categoria") onCategoria(s.categoria.id);
    else onCambio(s.producto.nombre);
  };

  const tecla = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") return cerrar();
    if (e.key === "Enter") {
      e.preventDefault();
      if (visible && activa >= 0) return elegir(lista[activa]);
      cerrar();
      campo.current?.blur();
      return;
    }
    if (!visible) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiva((a) => (a + 1) % lista.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiva((a) => (a <= 0 ? lista.length - 1 : a - 1));
    }
  };

  return (
    <div ref={caja} className="relative">
      <label className={cn("text-muted-foreground flex h-12 items-center gap-2.5 px-3.5", CARD, "rounded-[14px]")}>
        <Search aria-hidden className="size-[17px] shrink-0" />
        <span className="sr-only">Buscar en la carta</span>
        <input
          ref={campo}
          type="search"
          role="combobox"
          aria-expanded={visible}
          aria-controls="carta-sugerencias"
          aria-autocomplete="list"
          aria-activedescendant={visible && activa >= 0 ? `carta-sugerencia-${activa}` : undefined}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          value={valor}
          onChange={(e) => {
            onCambio(e.target.value);
            setAbierta(true);
            setActiva(-1);
          }}
          onFocus={() => setAbierta(true)}
          onKeyDown={tecla}
          placeholder="¿Ya sabes qué quieres? Búscalo"
          className="text-foreground placeholder:text-muted-foreground min-w-0 flex-1 border-0 bg-transparent text-[15px] outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {valor && (
          <button
            type="button"
            onClick={() => {
              onCambio("");
              cerrar();
              campo.current?.focus();
            }}
            aria-label="Borrar la búsqueda"
            className="-mr-1.5 flex size-9 shrink-0 items-center justify-center rounded-full"
          >
            <X className="size-4" />
          </button>
        )}
      </label>

      {visible && (
        <ul
          id="carta-sugerencias"
          role="listbox"
          aria-label="Sugerencias"
          className="bg-card absolute inset-x-0 top-full z-10 m-0 mt-1.5 list-none overflow-hidden rounded-[14px] p-0 shadow-[0_2px_4px_rgba(26,28,30,0.08),0_12px_28px_rgba(26,28,30,0.16)]"
        >
          {lista.map((s, i) => {
            const nombre = s.tipo === "categoria" ? s.categoria.nombre : s.producto.nombre;
            const foto = s.tipo === "producto" ? s.producto.fotoUrl : null;
            return (
              <li
                key={s.clave}
                id={`carta-sugerencia-${i}`}
                role="option"
                aria-selected={i === activa}
                onClick={() => elegir(s)}
                className={cn(
                  "flex min-h-[52px] cursor-pointer items-center gap-3 px-3 py-1.5 active:bg-[#f7f9e3]",
                  i > 0 && "border-t border-[#eef1f2]",
                  i === activa && "bg-[#f7f9e3]",
                )}
              >
                <span className="bg-background relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-[10px]">
                  {foto ? (
                    <Image src={foto} alt="" fill sizes="40px" className="object-contain p-[3px]" />
                  ) : s.tipo === "categoria" ? (
                    <LayoutGrid aria-hidden className="text-charcoal size-[18px]" />
                  ) : (
                    <UtensilsCrossed aria-hidden className="text-muted-foreground/60 size-4" />
                  )}
                </span>
                <span className="min-w-0 flex-1 text-[15px] leading-snug">
                  <Resaltado texto={nombre} consulta={consulta} />
                </span>
                {s.tipo === "categoria" ? (
                  <span className="text-muted-foreground shrink-0 text-xs">Categoría</span>
                ) : (
                  <span className="font-heading text-charcoal shrink-0 text-[13px] font-bold tabular-nums">{pesos(s.producto.precio)}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** El nombre sugerido, con lo que la persona ya escribió en negrita. */
function Resaltado({ texto: completo, consulta }: { texto: string; consulta: string }) {
  const nombre = completo.normalize("NFC");
  const plano = sinTildes(nombre);
  const desde = consulta ? plano.indexOf(consulta) : -1;
  // Si quitar las tildes cambió el largo, las posiciones no coinciden: va sin negrita.
  if (desde < 0 || plano.length !== nombre.length) return nombre;
  const hasta = desde + consulta.length;
  return (
    <>
      {nombre.slice(0, desde)}
      <strong className="font-bold">{nombre.slice(desde, hasta)}</strong>
      {nombre.slice(hasta)}
    </>
  );
}

/** Cierra con Escape lo que esté abierto encima de la carta. */
function useEscape(onCerrar: () => void) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [onCerrar]);
}

function Encabezado() {
  return (
    <div className="flex items-center gap-3">
      <Image src="/registro-logo.jpg" alt="" width={44} height={44} priority className="size-11 shrink-0 rounded-xl object-cover" />
      <div className="min-w-0">
        <p className="text-[9px] font-bold tracking-[0.16em] text-[#46530a] uppercase">Centro Deportivo Alejandro Falla</p>
        <h1 className={cn(TITULO, "text-[22px] leading-[1.1]")}>Cafetería</h1>
      </div>
    </div>
  );
}

/**
 * Las categorías en cuadros grandes: foto + nombre, sin conteos. La foto es la
 * del primer producto de la categoría que tenga una. Se usa dos veces: al entrar
 * a la carta y dentro de la hoja del botón "Categorías" (`enHoja`), donde además
 * marca en negro la categoría que se estaba viendo (`aqui`).
 */
export function Cuadricula({ categorias, onElegir, enHoja = false, aqui = null }: {
  categorias: CategoriaCarta[];
  onElegir: (categoriaId: number) => void;
  enHoja?: boolean;
  aqui?: number | null;
}) {
  return (
    <nav aria-label="Categorías" className="grid grid-cols-2 gap-2.5">
      {categorias.map((c) => {
        const foto = c.productos.find((p) => p.fotoUrl)?.fotoUrl;
        const actual = enHoja && c.id === aqui;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onElegir(c.id)}
            aria-current={actual ? "true" : undefined}
            className={cn(
              "flex min-h-[78px] items-center gap-2.5 rounded-2xl py-2 pr-2.5 pl-2 text-left transition active:scale-[0.98]",
              actual ? "bg-stadium text-white" : enHoja ? "bg-background" : cn(CARD, "rounded-2xl"),
            )}
          >
            <span className={cn("relative flex size-[60px] shrink-0 items-center justify-center overflow-hidden rounded-xl", enHoja ? "bg-white" : "bg-background")}>
              {foto ? (
                <Image src={foto} alt="" fill sizes="60px" className="object-contain p-[5px]" />
              ) : (
                <UtensilsCrossed aria-hidden className="text-muted-foreground/60 size-5" />
              )}
            </span>
            <span className="min-w-0">
              <span className="block text-sm leading-[1.2] font-bold">{c.nombre}</span>
              {actual && <span className="text-primary block text-xs">Estás aquí</span>}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

/** Lo que abre el botón "Categorías": la misma cuadrícula, subiendo desde abajo. */
function HojaCategorias({ categorias, aqui, onElegir, onCerrar, children }: {
  categorias: CategoriaCarta[];
  aqui: number | null;
  onElegir: (categoriaId: number) => void;
  onCerrar: () => void;
  children?: React.ReactNode;
}) {
  useEscape(onCerrar);
  // Mientras la hoja está abierta, lo de atrás no se desplaza.
  useEffect(() => {
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = antes;
    };
  }, []);

  return (
    <div role="dialog" aria-modal="true" aria-label="Categorías" onClick={onCerrar} className="bg-stadium/60 fixed inset-0 z-30 flex items-end justify-center">
      <div onClick={(e) => e.stopPropagation()} className="bg-card flex max-h-[90dvh] w-full max-w-md flex-col gap-3.5 overflow-y-auto overscroll-contain rounded-t-[28px] px-4 pt-2.5 pb-[max(22px,env(safe-area-inset-bottom))] shadow-[0_-12px_32px_rgba(26,28,30,0.3)]">
        <span aria-hidden className="h-[5px] w-11 shrink-0 self-center rounded-full bg-[#d5dcdf]" />
        <div className="flex items-center justify-between">
          <h2 className={cn(TITULO, "text-xl")}>¿Qué se te antoja?</h2>
          <button type="button" onClick={onCerrar} aria-label="Cerrar las categorías" className="bg-background flex size-11 shrink-0 items-center justify-center rounded-full">
            <X className="size-[18px]" />
          </button>
        </div>
        <Cuadricula categorias={categorias} onElegir={onElegir} enHoja aqui={aqui} />
        {children}
      </div>
    </div>
  );
}

/** El botón negro con cuántas cosas lleva la persona y cuánto suman. */
function BotonPedido({ etiqueta, unidades: n, valor, onClick, flotante = false }: {
  etiqueta: string;
  unidades: number;
  valor: string;
  onClick: () => void;
  flotante?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "bg-stadium flex h-[58px] min-w-0 shrink-0 items-center gap-2.5 rounded-[18px] pr-3.5 pl-3 text-white active:translate-y-px",
        flotante ? "flex-1 shadow-[0_10px_24px_rgba(26,28,30,0.28)]" : "w-full",
      )}
    >
      <span className="bg-primary text-stadium font-heading flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-extrabold tabular-nums">{n}</span>
      {flotante ? (
        // Junto al botón "Categorías" no cabe todo en un renglón (se cortaba "Mi pedido"
        // con totales de cinco cifras): la etiqueta va encima del valor.
        <span className="flex min-w-0 flex-col items-start leading-tight">
          <span className="text-[11px] font-semibold text-white/75">{etiqueta}</span>
          <span className="font-heading text-primary text-base font-extrabold tabular-nums">{valor}</span>
        </span>
      ) : (
        <>
          <span className="truncate text-sm font-bold">{etiqueta}</span>
          <span className="font-heading text-primary ml-auto shrink-0 text-base font-extrabold tabular-nums">{valor}</span>
        </>
      )}
    </button>
  );
}

/** La foto del producto en la lista: se toca para verla en grande. */
function Miniatura({ producto, onAmpliar }: { producto: ProductoCarta; onAmpliar: (p: ProductoCarta) => void }) {
  if (!producto.fotoUrl) {
    return (
      <span aria-hidden className="bg-muted text-muted-foreground/60 flex size-16 shrink-0 items-center justify-center rounded-xl">
        <UtensilsCrossed className="size-5" />
      </span>
    );
  }
  return (
    <button type="button" onClick={() => onAmpliar(producto)} aria-label={`Ver la foto de ${producto.nombre}`} className="relative size-16 shrink-0 overflow-hidden rounded-xl border border-[#e9edef] bg-white">
      {/* Las fotos del club son recortes con fondo transparente: van completas sobre blanco. */}
      <Image src={producto.fotoUrl} alt="" fill sizes="64px" className="object-contain p-1" />
    </button>
  );
}

/** Lo que lleva algo en el pedido se pinta con un fondo lima muy suave. */
const FILA = "border-t border-[#eef1f2] first:border-t-0";
const ELEGIDA = "bg-[#f7f9e3]";

/**
 * Un producto de la carta. Si tiene opciones (los sabores de un jugo), llega
 * PLEGADO: un botón "Elegir" las despliega y las vuelve a recoger (Laura,
 * 20-nov-2026: no quiere la lista de sabores siempre abierta). Plegado y con
 * algo ya escogido, el botón muestra cuántos lleva.
 */
export function FilaProducto({ producto, conFotos, cantidad, onCambio, onAmpliar, desplegado = false }: {
  producto: ProductoCarta;
  conFotos: boolean;
  cantidad: Cantidad;
  onCambio: Cambiar;
  onAmpliar: (p: ProductoCarta) => void;
  /** Cómo arrancan las opciones. En la carta siempre plegadas; lo usan las pruebas. */
  desplegado?: boolean;
}) {
  const [abierto, setAbierto] = useState(desplegado);
  const datos = (
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="text-[15px] leading-snug font-semibold">{producto.nombre}</span>
      {producto.descripcion && <span className="text-muted-foreground text-[13px] leading-snug">{producto.descripcion}</span>}
      <span className="font-heading text-charcoal text-sm font-bold tabular-nums">{pesos(producto.precio)}</span>
    </span>
  );

  if (producto.opciones.length > 0) {
    const elegidas = producto.opciones.reduce((suma, o) => suma + cantidad(producto.id, o), 0);
    // La columna de la izquierda (debajo de la foto) lleva el dibujo de la fruta de cada
    // sabor, cuando lo hay; sin foto y sin dibujos esa columna no existe.
    const conColumna = conFotos || producto.opciones.some((o) => frutaDe(o));
    const idOpciones = `opciones-${producto.id}`;
    return (
      <div className={cn(FILA, "px-3.5 py-2.5", elegidas > 0 && ELEGIDA)}>
        <div className="flex items-center gap-3">
          {conFotos && <Miniatura producto={producto} onAmpliar={onAmpliar} />}
          <button type="button" onClick={() => setAbierto((a) => !a)} aria-expanded={abierto} aria-controls={idOpciones} className="flex min-w-0 flex-1 items-center gap-3 text-left">
            {datos}
            <span className={cn("flex h-11 shrink-0 items-center gap-1.5 rounded-full pr-3 pl-4 text-sm font-bold", elegidas > 0 ? "bg-stadium text-white" : "bg-primary text-stadium")}>
              {elegidas > 0 ? (
                <>
                  <span className="font-heading text-primary text-[15px] font-extrabold tabular-nums">{elegidas}</span>
                  <span className="sr-only">en tu pedido</span>
                </>
              ) : (
                "Elegir"
              )}
              <ChevronDown aria-hidden className={cn("size-[18px] transition-transform", abierto && "rotate-180")} strokeWidth={2.6} />
            </span>
          </button>
        </div>
        {abierto && (
          <div id={idOpciones}>
            {producto.opciones.map((opcion) => (
              <div key={opcion} className="flex items-center gap-3 pt-2">
                {conColumna && (
                  <span className="flex w-16 shrink-0 justify-center">
                    <IconoFruta opcion={opcion} className="size-10" />
                  </span>
                )}
                <span className="text-charcoal min-w-0 flex-1 text-sm">{opcion}</span>
                <Contador nombre={`${producto.nombre} ${opcion.toLowerCase()}`} cantidad={cantidad(producto.id, opcion)}
                  onMas={() => onCambio(producto.id, opcion, 1)} onMenos={() => onCambio(producto.id, opcion, -1)} />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  const n = cantidad(producto.id);
  return (
    <div className={cn(FILA, "flex items-center gap-3 px-3.5 py-2.5", n > 0 && ELEGIDA)}>
      {conFotos && <Miniatura producto={producto} onAmpliar={onAmpliar} />}
      {datos}
      <Contador nombre={producto.nombre} cantidad={n} onMas={() => onCambio(producto.id, undefined, 1)} onMenos={() => onCambio(producto.id, undefined, -1)} />
    </div>
  );
}

/** La foto en grande, sobre la carta. Se cierra tocando fuera, la X o Escape. */
function FotoAmpliada({ producto, onCerrar }: { producto: ProductoCarta; onCerrar: () => void }) {
  useEscape(onCerrar);

  if (!producto.fotoUrl) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label={producto.nombre} onClick={onCerrar} className="bg-stadium/85 fixed inset-0 z-30 flex items-center justify-center p-4 backdrop-blur-sm">
      <div onClick={(e) => e.stopPropagation()} className="bg-card w-full max-w-md overflow-hidden rounded-2xl shadow-xl">
        <div className="relative aspect-square w-full bg-white">
          <Image src={producto.fotoUrl} alt={producto.nombre} fill sizes="(max-width: 448px) 100vw, 448px" className="object-contain p-6" />
          <button type="button" onClick={onCerrar} aria-label="Cerrar la foto" className="bg-stadium/70 absolute top-3 right-3 flex size-10 items-center justify-center rounded-full text-white">
            <X className="size-5" />
          </button>
        </div>
        <div className="space-y-0.5 border-t px-5 py-4">
          <p className="text-[15px] leading-snug font-semibold">{producto.nombre}</p>
          {producto.descripcion && <p className="text-muted-foreground text-[13px] leading-snug">{producto.descripcion}</p>}
          <p className="font-heading text-base font-extrabold tabular-nums">{pesos(producto.precio)}</p>
        </div>
      </div>
    </div>
  );
}

function Contador({ nombre, cantidad, onMas, onMenos }: { nombre: string; cantidad: number; onMas: () => void; onMenos: () => void }) {
  if (cantidad === 0) {
    return (
      <button type="button" onClick={onMas} aria-label={`Agregar ${nombre}`}
        className="bg-primary text-stadium flex size-11 shrink-0 items-center justify-center rounded-full transition active:scale-95">
        <Plus className="size-[18px]" strokeWidth={2.6} />
      </button>
    );
  }
  return (
    <div className="bg-stadium flex h-11 shrink-0 items-center rounded-full text-white">
      <button type="button" onClick={onMenos} aria-label={`Quitar un ${nombre}`} className="flex h-11 w-10 items-center justify-center rounded-full active:bg-white/10">
        <Minus className="size-4" strokeWidth={2.6} />
      </button>
      <span aria-live="polite" className="font-heading text-primary min-w-[18px] text-center text-[15px] font-extrabold tabular-nums">{cantidad}</span>
      <button type="button" onClick={onMas} disabled={cantidad >= MAX_POR_LINEA} aria-label={`Agregar otro ${nombre}`} className="flex h-11 w-10 items-center justify-center rounded-full active:bg-white/10 disabled:opacity-40">
        <Plus className="size-4" strokeWidth={2.6} />
      </button>
    </div>
  );
}

function Campo({ label, name, error, children }: { label: string; name: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name} className="text-charcoal text-[13px] font-semibold">{label}</Label>
      {children}
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
}
