"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import {
  FOTO_MAX_BYTES,
  FOTO_MAX_MB,
  FOTO_TIPOS,
  PUEDE_CAMBIAR_WHATSAPP,
  leerOpciones,
} from "@/lib/cafeteria/carta";
import {
  categoriaSchema,
  productoEditarSchema,
  productoSchema,
  whatsappSchema,
} from "@/lib/validations/cafeteria";
import type { ZodIssue } from "zod";

/**
 * Acciones del panel de la cafetería. Cada una vuelve a validar el rol (el
 * guardia de la página no protege la acción) y **mira cuántas filas tocó**: una
 * escritura que la RLS rechaza no lanza error, simplemente no escribe.
 */

export type CafeteriaState = {
  error?: string;
  ok?: string;
  fieldErrors?: Record<string, string>;
};

const EDITAN = rolesForModule("cafeteria", "edit");
const NO_GUARDO = "No se guardó el cambio. Recarga la página y vuelve a intentar.";

function errores(issues: ZodIssue[]): CafeteriaState {
  const fieldErrors: Record<string, string> = {};
  for (const i of issues) fieldErrors[String(i.path[0])] = i.message;
  return { error: "Revisa los campos.", fieldErrors };
}

/** La carta pública se pinta en cada visita, pero se avisa igual por si algún día se cachea. */
function refrescar() {
  revalidatePath("/cafeteria");
  revalidatePath("/carta");
}

/**
 * Cierra el editor y vuelve a la rejilla de donde se vino, con el aviso de lo que
 * se acaba de hacer (Laura, 20-nov-2026: quedarse en el editor después de guardar
 * hacía creer que la acción no había surtido efecto).
 *
 * `volver` viene del editor: la categoría que estaba escogida, o vacío = "Todas".
 * Si el producto ya no está en esa categoría (se movió al editarlo) se va a la
 * suya, para que su tarjeta se vea al llegar.
 */
function volverALaCarta(formData: FormData, categoriaDelProducto: number, aviso: Record<string, string>): never {
  const q = new URLSearchParams();
  const de = Number(formData.get("volver"));
  if (Number.isInteger(de) && de > 0) q.set("categoria", String(categoriaDelProducto));
  for (const [clave, valor] of Object.entries(aviso)) q.set(clave, valor);
  redirect(`/cafeteria?${q}`);
}

/** La foto que viene en el formulario, ya validada; `null` si no mandaron ninguna. */
function leerFoto(formData: FormData): { archivo: File | null; error?: string } {
  const archivo = formData.get("foto");
  if (!(archivo instanceof File) || archivo.size === 0) return { archivo: null };
  if (!FOTO_TIPOS.includes(archivo.type)) return { archivo: null, error: "La foto debe ser JPG, PNG o WEBP." };
  if (archivo.size > FOTO_MAX_BYTES) return { archivo: null, error: `La foto supera ${FOTO_MAX_MB} MB.` };
  return { archivo };
}

const EXTENSION: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Sube la foto a `<id del producto>/<instante>.<ext>` y devuelve la ruta. */
async function subirFoto(supabase: Supabase, productoId: number, archivo: File) {
  const path = `${productoId}/${Date.now()}.${EXTENSION[archivo.type] ?? "jpg"}`;
  const { error } = await supabase.storage.from("cafeteria").upload(path, archivo, { contentType: archivo.type });
  return { path: error ? null : path, error: error?.message ?? null };
}

// ───────────────────────────── Productos ─────────────────────────────

export async function crearProducto(_prev: CafeteriaState, formData: FormData): Promise<CafeteriaState> {
  await requireRole(EDITAN);
  const parsed = productoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return errores(parsed.error.issues);
  const d = parsed.data;
  const foto = leerFoto(formData);
  if (foto.error) return { error: foto.error, fieldErrors: { foto: foto.error } };

  // Sin precio no puede salir a la carta: se guarda apagado y se avisa.
  const quiereDisponible = formData.get("disponible") === "si";
  const disponible = quiereDisponible && d.precio > 0;

  const supabase = await createClient();
  const { data: creado, error } = await supabase
    .from("cafeteria_productos")
    .insert({
      categoria_id: d.categoriaId,
      nombre: d.nombre,
      precio: d.precio,
      descripcion: d.descripcion || null,
      opciones: leerOpciones(d.opciones),
      disponible,
    })
    .select("id")
    .maybeSingle();
  if (error) return { error: error.message };
  if (!creado) return { error: NO_GUARDO };

  let avisoFoto = "";
  if (foto.archivo) {
    const subida = await subirFoto(supabase, creado.id, foto.archivo);
    if (subida.path) {
      const { data: conFoto } = await supabase
        .from("cafeteria_productos")
        .update({ foto_path: subida.path })
        .eq("id", creado.id)
        .select("id");
      if (!conFoto?.length) {
        await supabase.storage.from("cafeteria").remove([subida.path]);
        avisoFoto = " La foto no se pudo guardar: súbela otra vez desde Editar.";
      }
    } else {
      avisoFoto = " La foto no se pudo subir: súbela otra vez desde Editar.";
    }
  }

  await logAudit({
    action: "cafeteria.producto.crear",
    entity: "cafeteria_productos",
    entityId: String(creado.id),
    after: { nombre: d.nombre, precio: d.precio, disponible },
  });
  refrescar();
  // Si algo quedó a medias (sin precio, o la foto no subió) se lleva a la persona
  // al editor de ESE producto con el aviso; si todo salió bien, de vuelta a la
  // carta, en la categoría donde quedó.
  const sinPrecio = quiereDisponible && !disponible;
  if (sinPrecio || avisoFoto) {
    redirect(`/cafeteria/producto/${creado.id}?aviso=${avisoFoto ? "foto" : "precio"}`);
  }
  volverALaCarta(formData, d.categoriaId, { hecho: "creado", p: String(creado.id) });
}

export async function editarProducto(_prev: CafeteriaState, formData: FormData): Promise<CafeteriaState> {
  await requireRole(EDITAN);
  const parsed = productoEditarSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return errores(parsed.error.issues);
  const d = parsed.data;
  const foto = leerFoto(formData);
  if (foto.error) return { error: foto.error, fieldErrors: { foto: foto.error } };
  const quitarFoto = formData.get("quitarFoto") === "1";

  const supabase = await createClient();
  const { data: antes } = await supabase
    .from("cafeteria_productos")
    .select("id, nombre, precio, disponible, foto_path, categoria_id")
    .eq("id", d.id)
    .maybeSingle();
  if (!antes) return { error: "Ese producto ya no existe. Recarga la página." };

  // El editor manda el interruptor como "si" / "no". Si no viene (otro formulario),
  // se conserva como estaba. Sin precio no puede quedar disponible: la base no deja
  // tener disponible algo en $0, y es mejor decirlo que fallar.
  const campo = formData.get("disponible");
  const quiere = campo === "si" ? true : campo === "no" ? false : antes.disponible;
  const disponible = quiere && d.precio > 0;
  const seApaga = quiere && !disponible;

  let nuevaRuta: string | null | undefined; // undefined = la foto no cambia
  if (foto.archivo) {
    const subida = await subirFoto(supabase, d.id, foto.archivo);
    if (!subida.path) return { error: "La foto no se pudo subir. Intenta de nuevo." };
    nuevaRuta = subida.path;
  } else if (quitarFoto) {
    nuevaRuta = null;
  }

  const { data: guardado, error } = await supabase
    .from("cafeteria_productos")
    .update({
      categoria_id: d.categoriaId,
      nombre: d.nombre,
      precio: d.precio,
      descripcion: d.descripcion || null,
      opciones: leerOpciones(d.opciones),
      disponible,
      ...(nuevaRuta !== undefined ? { foto_path: nuevaRuta } : {}),
    })
    .eq("id", d.id)
    .select("id");
  if (error || !guardado?.length) {
    // La foto nueva quedó subida sin que nadie la apunte: se borra para no dejar basura.
    if (nuevaRuta) await supabase.storage.from("cafeteria").remove([nuevaRuta]);
    return { error: error?.message ?? NO_GUARDO };
  }

  // La foto anterior ya no la referencia nadie.
  if (nuevaRuta !== undefined && antes.foto_path && antes.foto_path !== nuevaRuta) {
    await supabase.storage.from("cafeteria").remove([antes.foto_path]);
  }

  await logAudit({
    action: "cafeteria.producto.editar",
    entity: "cafeteria_productos",
    entityId: String(d.id),
    before: { nombre: antes.nombre, precio: antes.precio, disponible: antes.disponible, categoria_id: antes.categoria_id },
    after: { nombre: d.nombre, precio: d.precio, disponible, categoria_id: d.categoriaId },
  });
  refrescar();
  volverALaCarta(formData, d.categoriaId, { hecho: "guardado", p: String(d.id), ...(seApaga ? { nota: "sin_precio" } : {}) });
}

/**
 * El interruptor Disponible / No disponible. Se llama directo (sin formulario)
 * para que responda con un toque desde el celular o el computador.
 */
export async function cambiarDisponible(id: number, disponible: boolean): Promise<{ error?: string }> {
  await requireRole(EDITAN);
  if (!Number.isInteger(id) || id <= 0) return { error: "Producto inválido." };

  const supabase = await createClient();
  if (disponible) {
    const { data: p } = await supabase.from("cafeteria_productos").select("precio").eq("id", id).maybeSingle();
    if (!p) return { error: "Ese producto ya no existe. Recarga la página." };
    if (p.precio <= 0) return { error: "Ponle el precio antes de dejarlo disponible." };
  }

  const { data, error } = await supabase
    .from("cafeteria_productos")
    .update({ disponible })
    .eq("id", id)
    .select("id, nombre");
  if (error) return { error: error.message };
  if (!data?.length) return { error: NO_GUARDO };

  await logAudit({
    action: disponible ? "cafeteria.producto.disponible" : "cafeteria.producto.no_disponible",
    entity: "cafeteria_productos",
    entityId: String(id),
    after: { nombre: data[0].nombre, disponible },
  });
  refrescar();
  return {};
}

/**
 * Elimina un producto. Los pedidos viejos no se tocan: el historial guarda el
 * nombre y el precio como estaban, no un puntero al producto.
 */
export async function eliminarProducto(_prev: CafeteriaState, formData: FormData): Promise<CafeteriaState> {
  await requireRole(EDITAN);
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) return { error: "Producto inválido." };

  const supabase = await createClient();
  const { data: borrado, error } = await supabase
    .from("cafeteria_productos")
    .delete()
    .eq("id", id)
    .select("id, nombre, precio, descripcion, opciones, disponible, categoria_id, foto_path");
  if (error) return { error: error.message };
  if (!borrado?.length) return { error: NO_GUARDO };

  const fila = borrado[0];
  if (fila.foto_path) await supabase.storage.from("cafeteria").remove([fila.foto_path]);

  await logAudit({
    action: "cafeteria.producto.eliminar",
    entity: "cafeteria_productos",
    entityId: String(id),
    before: fila,
  });
  refrescar();
  volverALaCarta(formData, fila.categoria_id, { hecho: "eliminado", n: fila.nombre });
}

// ───────────────────────────── Categorías ─────────────────────────────

export async function crearCategoria(_prev: CafeteriaState, formData: FormData): Promise<CafeteriaState> {
  await requireRole(EDITAN);
  const parsed = categoriaSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return errores(parsed.error.issues);

  const supabase = await createClient();
  // Entra al final de la carta.
  const { data: ultima } = await supabase
    .from("cafeteria_categorias")
    .select("orden")
    .order("orden", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from("cafeteria_categorias")
    .insert({ nombre: parsed.data.nombre, orden: (ultima?.orden ?? 0) + 1 })
    .select("id")
    .maybeSingle();
  if (error) {
    return { error: error.code === "23505" ? "Ya existe una categoría con ese nombre." : error.message };
  }
  if (!data) return { error: NO_GUARDO };

  await logAudit({ action: "cafeteria.categoria.crear", entity: "cafeteria_categorias", entityId: String(data.id), after: { nombre: parsed.data.nombre } });
  refrescar();
  return { ok: "Categoría agregada." };
}

export async function renombrarCategoria(_prev: CafeteriaState, formData: FormData): Promise<CafeteriaState> {
  await requireRole(EDITAN);
  const id = Number(formData.get("id"));
  const parsed = categoriaSchema.safeParse(Object.fromEntries(formData));
  if (!Number.isInteger(id) || id <= 0) return { error: "Categoría inválida." };
  if (!parsed.success) return errores(parsed.error.issues);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cafeteria_categorias")
    .update({ nombre: parsed.data.nombre })
    .eq("id", id)
    .select("id");
  if (error) {
    return { error: error.code === "23505" ? "Ya existe una categoría con ese nombre." : error.message };
  }
  if (!data?.length) return { error: NO_GUARDO };

  await logAudit({ action: "cafeteria.categoria.renombrar", entity: "cafeteria_categorias", entityId: String(id), after: { nombre: parsed.data.nombre } });
  refrescar();
  return { ok: "Nombre guardado." };
}

/**
 * Sube o baja una categoría un puesto. Se renumeran TODAS (1, 2, 3…) en vez de
 * intercambiar dos números: así un empate o un hueco en `orden` no deja la
 * flecha sin efecto.
 */
export async function moverCategoria(id: number, direccion: "subir" | "bajar"): Promise<{ error?: string }> {
  await requireRole(EDITAN);
  const supabase = await createClient();
  const { data: lista, error } = await supabase
    .from("cafeteria_categorias")
    .select("id, orden")
    .order("orden")
    .order("nombre");
  if (error || !lista) return { error: error?.message ?? "No se pudo leer la carta." };

  const desde = lista.findIndex((c) => c.id === id);
  const hasta = direccion === "subir" ? desde - 1 : desde + 1;
  if (desde < 0 || hasta < 0 || hasta >= lista.length) return {};

  const nueva = [...lista];
  [nueva[desde], nueva[hasta]] = [nueva[hasta], nueva[desde]];
  for (const [i, c] of nueva.entries()) {
    if (c.orden === i + 1) continue;
    const { data, error: e } = await supabase
      .from("cafeteria_categorias")
      .update({ orden: i + 1 })
      .eq("id", c.id)
      .select("id");
    if (e || !data?.length) return { error: e?.message ?? NO_GUARDO };
  }
  refrescar();
  return {};
}

/** Solo se elimina una categoría vacía: primero hay que mover o eliminar sus productos. */
export async function eliminarCategoria(_prev: CafeteriaState, formData: FormData): Promise<CafeteriaState> {
  await requireRole(EDITAN);
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) return { error: "Categoría inválida." };
  // A dónde pasan sus productos, si los tiene. Vacío = no se escogió ninguna.
  const destino = Number(formData.get("destino")) || null;

  const supabase = await createClient();
  const { count } = await supabase
    .from("cafeteria_productos")
    .select("id", { count: "exact", head: true })
    .eq("categoria_id", id);
  const productos = count ?? 0;

  // Una categoría con productos no se borra (la base tampoco deja: `on delete restrict`).
  // Primero se pasan a otra; NUNCA se eliminan los productos de paso.
  let movidos = 0;
  let nombreDestino = "";
  if (productos > 0) {
    if (!destino || destino === id) {
      return { error: `Tiene ${productos} producto(s). Escoge a qué categoría pasan antes de eliminarla.` };
    }
    const { data: otra } = await supabase.from("cafeteria_categorias").select("id, nombre").eq("id", destino).maybeSingle();
    if (!otra) return { error: "La categoría a la que quieres pasar los productos ya no existe. Recarga la página." };
    nombreDestino = otra.nombre;

    const { data: pasados, error: errorMover } = await supabase
      .from("cafeteria_productos")
      .update({ categoria_id: destino })
      .eq("categoria_id", id)
      .select("id");
    if (errorMover) return { error: errorMover.message };
    if ((pasados?.length ?? 0) !== productos) return { error: NO_GUARDO };
    movidos = pasados!.length;
  }

  const { data, error } = await supabase.from("cafeteria_categorias").delete().eq("id", id).select("id, nombre");
  if (error) return { error: error.message };
  if (!data?.length) return { error: NO_GUARDO };

  await logAudit({
    action: "cafeteria.categoria.eliminar",
    entity: "cafeteria_categorias",
    entityId: String(id),
    before: data[0],
    after: movidos > 0 ? { productos_movidos: movidos, a_categoria: destino, a_nombre: nombreDestino } : null,
  });
  refrescar();
  return {
    ok:
      movidos > 0
        ? `Eliminaste «${data[0].nombre}». ${movidos === 1 ? "Su producto pasó" : `Sus ${movidos} productos pasaron`} a «${nombreDestino}».`
        : `Eliminaste «${data[0].nombre}».`,
  };
}

// ───────────────────────────── WhatsApp ─────────────────────────────

/** El número a donde llegan los pedidos. Solo superadministrador y coordinación administrativa. */
export async function guardarWhatsapp(_prev: CafeteriaState, formData: FormData): Promise<CafeteriaState> {
  const perfil = await requireRole(PUEDE_CAMBIAR_WHATSAPP);
  const parsed = whatsappSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return errores(parsed.error.issues);

  const supabase = await createClient();
  const { data: antes } = await supabase.from("cafeteria_ajustes").select("whatsapp").maybeSingle();
  const { data, error } = await supabase
    .from("cafeteria_ajustes")
    .update({ whatsapp: parsed.data.whatsapp, actualizado_por: perfil.id })
    .eq("id", true)
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: NO_GUARDO };

  await logAudit({
    action: "cafeteria.whatsapp.cambiar",
    entity: "cafeteria_ajustes",
    before: { whatsapp: antes?.whatsapp ?? "" },
    after: { whatsapp: parsed.data.whatsapp },
  });
  refrescar();
  return { ok: parsed.data.whatsapp ? "Número guardado." : "Sin número: WhatsApp dejará escoger el contacto." };
}
