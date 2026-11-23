"use client";

import { startTransition, useActionState, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ImagePlus, Plus, X } from "lucide-react";
import { crearProducto, editarProducto, eliminarProducto, type CafeteriaState } from "./actions";
import { Pista } from "./interruptor";
import { VistaComprador, type ItemVista } from "./vista-comprador";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FOTO_MAX_MB, FOTO_TIPOS, leerOpciones, type CategoriaAdmin, type ProductoAdmin } from "@/lib/cafeteria/carta";
import { reducirFoto } from "@/lib/cafeteria/foto";
import { cn } from "@/lib/utils";

const inicial: CafeteriaState = {};
const CAMPO = "h-11";
const SELECT = "border-input bg-background h-11 w-full rounded-lg border px-3 text-sm";

/** Lo que el servidor avisa al llegar aquí recién creado el producto. */
const AVISOS: Record<string, string> = {
  foto: "El producto se creó, pero la foto no se pudo subir. Súbela de nuevo aquí.",
  precio: "El producto se creó sin precio, así que quedó como no disponible. Ponle el precio y déjalo disponible.",
};

/**
 * Crear o editar un producto de la carta (sin `producto` = crear), con el
 * celular de "Así lo ve el comprador" al lado, que cambia mientras se escribe.
 * Un solo componente para los dos casos, a propósito: dos copias ya se
 * desalinearon en este proyecto (el formulario de clientes).
 *
 * La foto se escoge desde el computador o el celular y se reduce en el navegador
 * antes de subir.
 */
export function ProductoEditor({
  categorias,
  productos,
  producto,
  categoriaInicial,
  volverA,
  aviso,
}: {
  categorias: CategoriaAdmin[];
  /** Toda la carta: de aquí sale la lista que pinta el celular. */
  productos: ProductoAdmin[];
  producto?: ProductoAdmin;
  /** Al crear: la categoría que viene escogida. */
  categoriaInicial?: number;
  /** La categoría que estaba escogida en la rejilla al venir aquí; `null` = "Todas". Al guardar se vuelve ahí. */
  volverA: number | null;
  aviso?: string;
}) {
  const editando = !!producto;
  const [estado, guardar, guardando] = useActionState(editando ? editarProducto : crearProducto, inicial);
  const [borrado, eliminar, eliminando] = useActionState(eliminarProducto, inicial);
  const fe = estado.fieldErrors ?? {};

  const [nombre, setNombre] = useState(producto?.nombre ?? "");
  const [categoriaId, setCategoriaId] = useState(producto?.categoriaId ?? categoriaInicial ?? categorias[0]?.id ?? 0);
  const [precio, setPrecio] = useState(producto && producto.precio > 0 ? String(producto.precio) : "");
  const [descripcion, setDescripcion] = useState(producto?.descripcion ?? "");
  const [opciones, setOpciones] = useState<string[]>(producto?.opciones ?? []);
  const [opcionNueva, setOpcionNueva] = useState("");
  const [disponible, setDisponible] = useState(producto?.disponible ?? true);
  // La foto ya reducida, lista para enviar; y lo que se ve en el recuadro.
  const [foto, setFoto] = useState<File | null>(null);
  const [vista, setVista] = useState<string | null>(producto?.fotoUrl ?? null);
  const [quitar, setQuitar] = useState(false);
  const [preparando, setPreparando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const entradaFoto = useRef<HTMLInputElement>(null);

  const volver = volverA ? `/cafeteria?categoria=${volverA}` : "/cafeteria";
  const nombreVolver = categorias.find((c) => c.id === volverA)?.nombre ?? "la carta";
  const precioNumero = Number(precio.replace(/\D/g, "")) || 0;
  // Una opción escrita pero sin "agregar" también cuenta: no se pierde al guardar.
  const opcionesFinales = useMemo(() => leerOpciones([...opciones, opcionNueva].join(",")), [opciones, opcionNueva]);

  // La vista previa de una foto recién escogida es una URL temporal: se libera al cambiarla.
  useEffect(() => {
    return () => {
      if (vista?.startsWith("blob:")) URL.revokeObjectURL(vista);
    };
  }, [vista]);

  const escogerFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    setPreparando(true);
    const reducida = await reducirFoto(archivo);
    setFoto(reducida);
    setVista(URL.createObjectURL(reducida));
    setQuitar(false);
    setPreparando(false);
  };

  const quitarFoto = () => {
    setFoto(null);
    setVista(null);
    setQuitar(true);
    if (entradaFoto.current) entradaFoto.current.value = "";
  };

  const agregarOpcion = () => {
    setOpciones(leerOpciones([...opciones, opcionNueva].join(",")));
    setOpcionNueva("");
  };

  // Se envía a mano (y no con `action=`) por dos razones: para mandar la foto
  // REDUCIDA en lugar de la original, y porque así React no borra lo escrito
  // cuando el servidor devuelve un error.
  const enviar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const datos = new FormData();
    if (producto) datos.set("id", String(producto.id));
    datos.set("nombre", nombre);
    datos.set("categoriaId", String(categoriaId));
    datos.set("precio", precio);
    datos.set("descripcion", descripcion);
    datos.set("opciones", opcionesFinales.join(", "));
    datos.set("disponible", disponible ? "si" : "no");
    datos.set("volver", volverA ? String(volverA) : "");
    if (foto) datos.set("foto", foto);
    if (quitar) datos.set("quitarFoto", "1");
    startTransition(() => guardar(datos));
  };

  const borrar = () => {
    if (!producto) return;
    const datos = new FormData();
    datos.set("id", String(producto.id));
    datos.set("volver", volverA ? String(volverA) : "");
    startTransition(() => eliminar(datos));
  };

  // ── Lo que pinta el celular: la categoría escogida, como la vería el comprador ──
  const posicion = categorias.findIndex((c) => c.id === categoriaId);
  const categoria = categorias[posicion];
  const seVe = disponible && precioNumero > 0;
  const items: ItemVista[] = useMemo(() => {
    const otros: ItemVista[] = productos
      .filter((p) => p.categoriaId === categoriaId && p.disponible && p.precio > 0 && p.id !== producto?.id)
      .map((p) => ({ clave: String(p.id), nombre: p.nombre, descripcion: p.descripcion, precio: p.precio, opciones: p.opciones, fotoUrl: p.fotoUrl, actual: false }));
    if (!seVe) return otros;
    const este: ItemVista = { clave: "actual", nombre: nombre.trim(), descripcion: descripcion.trim() || null, precio: precioNumero, opciones: opcionesFinales, fotoUrl: vista, actual: true };
    // Mismo orden que la carta: alfabético dentro de la categoría.
    return [...otros, este].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, [productos, categoriaId, producto?.id, seVe, nombre, descripcion, precioNumero, opcionesFinales, vista]);
  const motivoOculto = seVe
    ? null
    : !disponible
      ? "Está como no disponible: el comprador no lo ve."
      : "Sin precio no aparece en la carta.";

  return (
    <div className="space-y-4">
      <Link href={volver} className="text-charcoal hover:text-foreground flex h-11 w-fit items-center gap-1.5 text-[13px] font-semibold">
        <ChevronLeft className="size-4" /> Volver a {nombreVolver}
      </Link>

      {aviso && AVISOS[aviso] && <p className="rounded-lg bg-[#f2b53d]/15 px-4 py-3 text-sm text-[#8a5600]">{AVISOS[aviso]}</p>}

      <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
        <form onSubmit={enviar} className="bg-card min-w-0 flex-1 space-y-5 rounded-xl p-5 shadow-sm ring-1 ring-foreground/[0.06] sm:p-6">
          <div>
            <p className="text-muted-foreground text-[10px] font-bold tracking-[0.12em] uppercase">{editando ? "Editar producto" : "Nuevo producto"}</p>
            <h2 className="font-heading text-[22px] leading-tight font-bold">{nombre.trim() || (editando ? producto.nombre : "Producto sin nombre")}</h2>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <span className={cn("text-muted-foreground flex size-[132px] shrink-0 items-center justify-center overflow-hidden rounded-xl ring-1 ring-foreground/[0.08]", vista ? "bg-white" : "bg-muted")}>
              {vista ? (
                // eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:) o la foto ya subida
                <img src={vista} alt={`Foto de ${nombre || "el producto"}`} className="size-full object-contain p-2.5" />
              ) : (
                <ImagePlus className="size-7" aria-label="Sin foto" />
              )}
            </span>
            <div className="min-w-[180px] flex-1 space-y-2">
              <p className="text-sm font-semibold">Foto</p>
              <div className="flex flex-wrap gap-2">
                <label className={cn(buttonVariants({ variant: "outline" }), "h-11 cursor-pointer px-3.5 font-semibold focus-within:ring-3 focus-within:ring-ring/50")}>
                  {vista ? "Cambiar foto" : "Subir foto"}
                  <input ref={entradaFoto} name="foto" type="file" accept={FOTO_TIPOS.join(",")} onChange={escogerFoto} className="sr-only" />
                </label>
                {vista && (
                  <Button type="button" variant="ghost" className="text-muted-foreground h-11 px-3 font-semibold" onClick={quitarFoto}>Quitar</Button>
                )}
              </div>
              <p className="text-muted-foreground text-xs">
                {preparando ? "Preparando la foto…" : `JPG, PNG o WEBP, hasta ${FOTO_MAX_MB} MB. Se reduce sola al subirla.`}
              </p>
              {fe.foto && <p className="text-destructive text-sm">{fe.foto}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="nombre">Nombre</Label>
            <Input id="nombre" name="nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Limonada de coco" maxLength={80} required className={CAMPO} />
            {fe.nombre && <p className="text-destructive text-sm">{fe.nombre}</p>}
          </div>

          <div className="grid gap-3.5 sm:grid-cols-[2fr_1fr]">
            <div className="space-y-1.5">
              <Label htmlFor="categoriaId">Categoría</Label>
              <select id="categoriaId" name="categoriaId" value={categoriaId} onChange={(e) => setCategoriaId(Number(e.target.value))} className={SELECT} required>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
              {fe.categoriaId && <p className="text-destructive text-sm">{fe.categoriaId}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="precio">Precio (pesos)</Label>
              <Input id="precio" name="precio" inputMode="numeric" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="Ej.: 8000" className={cn(CAMPO, "font-heading text-[15px] font-semibold tabular-nums md:text-[15px]")} />
              {fe.precio && <p className="text-destructive text-sm">{fe.precio}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <Label htmlFor="descripcion">Descripción</Label>
              <span className="text-muted-foreground text-xs">Opcional. Sale debajo del nombre.</span>
            </div>
            <Input id="descripcion" name="descripcion" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Ej.: Con papas a la francesa" maxLength={200} className={CAMPO} />
            {fe.descripcion && <p className="text-destructive text-sm">{fe.descripcion}</p>}
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <Label htmlFor="opcionNueva">Opciones para escoger</Label>
              <span className="text-muted-foreground text-xs">El comprador escoge una al pedir.</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {opciones.map((o) => (
                <span key={o} className="bg-muted flex h-9 items-center gap-1 rounded-full pr-1 pl-3.5 text-[13px] font-semibold">
                  {o}
                  <button type="button" aria-label={`Quitar la opción ${o}`} onClick={() => setOpciones(opciones.filter((x) => x !== o))} className="text-muted-foreground hover:bg-background hover:text-foreground flex size-7 items-center justify-center rounded-full">
                    <X className="size-3.5" strokeWidth={2.4} />
                  </button>
                </span>
              ))}
              <span className="flex h-9 items-center rounded-full border-[1.5px] border-dashed pr-1 pl-3.5 focus-within:border-solid">
                <input
                  id="opcionNueva"
                  value={opcionNueva}
                  onChange={(e) => setOpcionNueva(e.target.value.replace(/,/g, ""))}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    agregarOpcion();
                  }}
                  placeholder={opciones.length ? "Otra opción" : "Ej.: Frío"}
                  maxLength={40}
                  className="placeholder:text-muted-foreground w-28 bg-transparent text-[13px] font-semibold outline-none"
                />
                <button type="button" aria-label="Agregar la opción" onClick={agregarOpcion} disabled={!opcionNueva.trim()} className="text-muted-foreground hover:bg-muted hover:text-foreground flex size-7 items-center justify-center rounded-full disabled:opacity-40">
                  <Plus className="size-3.5" strokeWidth={2.6} />
                </button>
              </span>
            </div>
            {fe.opciones && <p className="text-destructive text-sm">{fe.opciones}</p>}
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={disponible}
            onClick={() => setDisponible((d) => !d)}
            className={cn(
              "flex w-full items-center justify-between gap-4 rounded-xl border px-4 py-3.5 text-left transition-colors",
              disponible ? "border-primary/60 bg-primary/10" : "bg-muted/50",
            )}
          >
            <span>
              <span className="block text-sm font-bold">{disponible ? "Disponible en la carta" : "No disponible"}</span>
              <span className="text-muted-foreground block text-xs">
                {disponible ? "Los compradores lo ven y lo pueden pedir." : "Los compradores no lo ven hasta que lo vuelvas a prender."}
              </span>
            </span>
            <Pista encendido={disponible} grande />
          </button>
          {disponible && precioNumero === 0 && (
            <p className="text-xs text-[#8a5600]">Sin precio no puede quedar disponible: al guardar quedará apagado.</p>
          )}

          {estado.error && <p className="text-destructive text-sm">{estado.error}</p>}
          {borrado.error && <p className="text-destructive text-sm">{borrado.error}</p>}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            {editando ? (
              confirmar ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-muted-foreground text-xs">¿Eliminar de la carta?</span>
                  <Button type="button" size="sm" variant="destructive" className="h-9" onClick={borrar} disabled={eliminando}>
                    {eliminando ? "Eliminando…" : "Sí, eliminar"}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className="h-9" onClick={() => setConfirmar(false)}>No</Button>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmar(true)} className="text-destructive h-11 px-1 text-[13px] font-semibold hover:underline">
                  Eliminar producto
                </button>
              )
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Link href={volver} className={cn(buttonVariants({ variant: "outline" }), "h-11 px-4 font-semibold")}>Cancelar</Link>
              <button type="submit" disabled={guardando || preparando} className="bg-stadium text-primary hover:bg-stadium/90 h-11 rounded-lg px-5 text-[13px] font-bold transition disabled:opacity-60">
                {guardando ? "Guardando…" : editando ? "Guardar cambios" : "Agregar producto"}
              </button>
            </div>
          </div>
        </form>

        <VistaComprador
          categoria={categoria?.nombre ?? "Categoría"}
          items={items}
          motivoOculto={motivoOculto}
        />
      </div>
    </div>
  );
}
