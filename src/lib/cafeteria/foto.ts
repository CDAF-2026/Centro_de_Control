import { FOTO_LADO_MAX } from "./carta";

/**
 * Reduce la foto EN EL NAVEGADOR antes de subirla. Una foto de celular pesa de 3
 * a 8 MB; la carta la muestra a lo sumo a 1.400 px, así que subirla entera solo
 * hace lenta la subida (con datos móviles) y la carta del comprador.
 *
 * Sale JPG con fondo blanco (un PNG transparente no se queda negro). Si algo
 * falla —un navegador viejo, un archivo raro— devuelve el original: el servidor
 * igual valida tipo y tamaño, así que aquí nunca se bloquea a nadie.
 */
export async function reducirFoto(archivo: File): Promise<File> {
  try {
    const imagen = await createImageBitmap(archivo);
    const escala = Math.min(1, FOTO_LADO_MAX / Math.max(imagen.width, imagen.height));
    const ancho = Math.round(imagen.width * escala);
    const alto = Math.round(imagen.height * escala);

    const lienzo = document.createElement("canvas");
    lienzo.width = ancho;
    lienzo.height = alto;
    const ctx = lienzo.getContext("2d");
    if (!ctx) return archivo;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, ancho, alto);
    ctx.drawImage(imagen, 0, 0, ancho, alto);
    imagen.close();

    const blob = await new Promise<Blob | null>((resolver) => lienzo.toBlob(resolver, "image/jpeg", 0.85));
    // Si "reducida" pesa más que la original (una imagen ya pequeña), se deja la original.
    if (!blob || (escala === 1 && blob.size >= archivo.size)) return archivo;
    const nombre = archivo.name.replace(/\.[^.]+$/, "") || "foto";
    return new File([blob], `${nombre}.jpg`, { type: "image/jpeg" });
  } catch {
    return archivo;
  }
}
