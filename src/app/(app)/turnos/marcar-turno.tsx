"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Info, Monitor, RotateCcw, Utensils, X } from "lucide-react";
import { marcar, type MarcarState } from "./actions";
import { horaCorta } from "@/lib/fecha";
import { Button } from "@/components/ui/button";
import { FOTOS_DIAS } from "@/lib/turnos";

type ConFoto = "entrada" | "salida";
/** Por qué no se pudo abrir la cámara. Cada caso se explica distinto. */
type FalloCamara = "bloqueada" | "sin_camara" | "ocupada" | "insegura" | "otro";

/** Lado de la foto que se guarda. 640 px basta para reconocer una cara y pesa ~60 KB. */
const LADO = 640;

function tipoDeFallo(e: unknown): FalloCamara {
  const nombre = e instanceof Error ? e.name : "";
  if (nombre === "NotAllowedError" || nombre === "SecurityError") return "bloqueada";
  if (nombre === "NotFoundError" || nombre === "OverconstrainedError") return "sin_camara";
  if (nombre === "NotReadableError" || nombre === "AbortError") return "ocupada";
  return "otro";
}

const TEXTO_FALLO: Record<FalloCamara, { titulo: string; detalle: string }> = {
  bloqueada: {
    titulo: "La cámara está bloqueada",
    detalle: "Sin la foto no se puede marcar: es la prueba de que fuiste tú.",
  },
  sin_camara: {
    titulo: "No encontramos la cámara",
    detalle: "Este aparato no tiene cámara disponible, o está desconectada.",
  },
  ocupada: {
    titulo: "La cámara está ocupada",
    detalle: "Otra aplicación la está usando. Ciérrala y vuelve a intentar.",
  },
  insegura: {
    titulo: "La cámara no está disponible aquí",
    detalle: "El navegador solo la permite en conexiones seguras (https).",
  },
  otro: {
    titulo: "No se pudo abrir la cámara",
    detalle: "Vuelve a intentar. Si sigue igual, marca en el computador de recepción.",
  },
};

export function MarcarTurno({
  nombre,
  fecha,
  saludo,
  inicioEl,
  pausaDesde,
}: {
  nombre: string;
  fecha: string;
  saludo: string;
  inicioEl: string | null;
  pausaDesde: string | null;
}) {
  /** Qué marcación está esperando la foto. null = no hay cámara abierta. */
  const [pendiente, setPendiente] = useState<ConFoto | null>(null);
  const [fallo, setFallo] = useState<FalloCamara | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<MarcarState>({});

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  function cerrarStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  // Apagar la cámara al salir de la pantalla. Sin esto la luz del celular se
  // queda prendida hasta que se cierre la pestaña.
  useEffect(() => () => cerrarStream(), []);

  // El <video> solo existe cuando la vista de cámara está montada, así que el
  // stream se conecta aquí y no dentro del try de `getUserMedia`.
  useEffect(() => {
    const v = videoRef.current;
    const s = streamRef.current;
    if (!pendiente || !v || !s) return;
    v.srcObject = s;
    void v.play().catch(() => {});
  }, [pendiente]);

  async function abrirCamara(accion: ConFoto) {
    setMensaje({});
    setFallo(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setFallo(window.isSecureContext ? "otro" : "insegura");
      return;
    }
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 1280 } },
        audio: false,
      });
      setPendiente(accion);
    } catch (e) {
      setFallo(tipoDeFallo(e));
    }
  }

  function cancelar() {
    cerrarStream();
    setPendiente(null);
  }

  async function capturar() {
    const v = videoRef.current;
    if (!v || !pendiente || enviando) return;

    // Recorte cuadrado desde el centro: el visor es cuadrado, así que la foto
    // guardada tiene que ser lo mismo que la persona vio.
    const lado = Math.min(v.videoWidth, v.videoHeight);
    if (!lado) return;
    const lienzo = document.createElement("canvas");
    lienzo.width = LADO;
    lienzo.height = LADO;
    const ctx = lienzo.getContext("2d");
    if (!ctx) return;
    // Se dibuja SIN espejo. El visor sí va espejado (abajo, con CSS) porque es
    // lo que uno espera al verse; la foto guardada es la imagen real.
    ctx.drawImage(
      v,
      (v.videoWidth - lado) / 2,
      (v.videoHeight - lado) / 2,
      lado,
      lado,
      0,
      0,
      LADO,
      LADO,
    );

    const foto = await new Promise<Blob | null>((res) =>
      lienzo.toBlob(res, "image/jpeg", 0.82),
    );
    if (!foto) {
      setMensaje({ error: "No se pudo tomar la foto. Vuelve a intentar." });
      return;
    }

    setEnviando(true);
    const datos = new FormData();
    datos.append("accion", pendiente);
    datos.append("foto", foto, "turno.jpg");
    const r = await marcar(datos);
    setEnviando(false);
    cerrarStream();
    setPendiente(null);
    setMensaje(r);
  }

  async function marcarPausa(accion: "pausa_inicio" | "pausa_fin") {
    if (enviando) return;
    setMensaje({});
    setEnviando(true);
    const datos = new FormData();
    datos.append("accion", accion);
    const r = await marcar(datos);
    setEnviando(false);
    setMensaje(r);
  }

  // ─────────────────────────── Cámara ───────────────────────────
  if (pendiente) {
    return (
      <VistaCamara
        accion={pendiente}
        enviando={enviando}
        videoRef={videoRef}
        onCancelar={cancelar}
        onCapturar={capturar}
      />
    );
  }

  // ─────────────────────── Cámara bloqueada ───────────────────────
  if (fallo) {
    return <VistaFallo fallo={fallo} onReintentar={() => setFallo(null)} />;
  }

  // ─────────────────────────── Estado ───────────────────────────
  const enPausa = !!pausaDesde;
  const enTurno = !!inicioEl;

  return (
    <div className="mx-auto flex max-w-md flex-col justify-center gap-5 py-6">
      {mensaje.error && (
        <p className="bg-destructive/10 text-destructive rounded-lg px-4 py-3 text-sm" role="alert">
          {mensaje.error}
        </p>
      )}
      {mensaje.ok && (
        <p className="bg-primary/20 rounded-lg px-4 py-3 text-sm font-medium text-[#46530a]">
          {mensaje.ok}
        </p>
      )}

      {!enTurno && (
        <>
          <div className="text-center">
            <p className="text-muted-foreground text-xs font-bold tracking-[0.09em] uppercase">
              {fecha}
            </p>
            <h1 className="font-display mt-2.5 text-[1.85rem] leading-[1.13] font-black tracking-tight uppercase italic">
              {saludo},
              <br />
              {nombre}
            </h1>
          </div>

          <Button
            size="lg"
            className="mt-4 h-[68px] w-full rounded-xl text-lg font-extrabold"
            onClick={() => abrirCamara("entrada")}
            disabled={enviando}
          >
            <Camera className="size-[22px]" />
            Iniciar turno
          </Button>
          <p className="text-muted-foreground -mt-2 text-center text-[13px] leading-relaxed">
            Se abre la cámara para tu foto de entrada.
          </p>

          <div className="bg-card ring-foreground/[0.06] mt-6 flex items-center gap-3 rounded-xl p-4 shadow-sm ring-1">
            <Info className="text-muted-foreground size-[18px] shrink-0" />
            <p className="text-muted-foreground text-[13px] leading-relaxed">
              Marca al llegar, al salir a almorzar, al regresar y al irte.
            </p>
          </div>
        </>
      )}

      {enTurno && (
        <>
          {/* El marcador. Oscuro con destello lima cuando el turno corre; apagado
              en almuerzo — que el color se vaya es la señal de que no cuenta. */}
          <div
            className={`relative overflow-hidden rounded-2xl px-6 pt-7 pb-6 shadow-lg ${
              enPausa ? "bg-[#2b3134]" : "bg-stadium"
            }`}
          >
            {!enPausa && (
              <span
                aria-hidden
                className="bg-primary/15 absolute -top-20 -right-16 size-56 rounded-full blur-3xl"
              />
            )}

            <div className="relative flex items-center gap-2.5">
              {enPausa ? (
                <Utensils className="text-warning size-4" />
              ) : (
                <span className="bg-primary ring-primary/20 size-2.5 rounded-full ring-4" />
              )}
              <span className="text-[11px] font-bold tracking-[0.1em] text-white/55 uppercase">
                {enPausa ? "Turno en pausa" : "Turno abierto"}
              </span>
            </div>

            <p
              className={`font-display relative mt-4 text-[2.6rem] leading-[1.02] font-black tracking-tight uppercase italic ${
                enPausa ? "text-warning" : "text-primary"
              }`}
            >
              {enPausa ? (
                <>
                  Estás
                  <br />
                  almorzando
                </>
              ) : (
                <>
                  Estás
                  <br />
                  en turno
                </>
              )}
            </p>
            <p className="relative mt-3 text-[15px] text-white/60 tabular-nums">
              {enPausa
                ? `Saliste a las ${horaCorta(pausaDesde)}`
                : `Entraste a las ${horaCorta(inicioEl)}`}
            </p>

            <div className="relative mt-7 flex flex-col gap-2.5">
              {enPausa ? (
                <Button
                  size="lg"
                  className="h-[58px] w-full rounded-xl text-[17px] font-extrabold"
                  onClick={() => marcarPausa("pausa_fin")}
                  disabled={enviando}
                >
                  <RotateCcw className="size-[19px]" />
                  {enviando ? "Un momento…" : "Regresé del almuerzo"}
                </Button>
              ) : (
                <>
                  <Button
                    size="lg"
                    className="h-[58px] w-full rounded-xl text-[17px] font-extrabold"
                    onClick={() => abrirCamara("salida")}
                    disabled={enviando}
                  >
                    <Camera className="size-[19px]" />
                    Cerrar turno
                  </Button>
                  <button
                    type="button"
                    onClick={() => marcarPausa("pausa_inicio")}
                    disabled={enviando}
                    className="font-heading flex h-[52px] w-full items-center justify-center gap-2.5 rounded-xl border border-white/20 text-[15px] font-semibold text-white transition-colors hover:bg-white/5 disabled:opacity-50"
                  >
                    <Utensils className="size-[17px]" />
                    {enviando ? "Un momento…" : "Salgo a almorzar"}
                  </button>
                </>
              )}
            </div>
          </div>

          {enPausa ? (
            /* Se dice por qué no está "Cerrar turno", en vez de esconderlo:
               la regla la aplica la base de datos y aquí solo se explica. */
            <div className="bg-card ring-warning/35 flex gap-3 rounded-xl p-4 shadow-sm ring-1">
              <Info className="mt-0.5 size-[18px] shrink-0 text-[#8a5600]" />
              <p className="text-[13px] leading-relaxed">
                <strong className="font-semibold">Primero marca tu regreso.</strong>{" "}
                <span className="text-muted-foreground">
                  No se puede cerrar el turno con el almuerzo abierto: no sabríamos cuánto
                  descontar.
                </span>
              </p>
            </div>
          ) : (
            <p className="text-muted-foreground text-center text-[13px] leading-relaxed">
              Al cerrar se abre la cámara para tu foto de salida.
            </p>
          )}
        </>
      )}
    </div>
  );
}

/**
 * El visor. Se separa de `MarcarTurno` para que se pueda RENDERIZAR en las
 * pruebas: dentro del componente grande solo se alcanza tocando un botón, y
 * entonces un error aquí no lo vería nada hasta que alguien fuera a marcar.
 */
export function VistaCamara({
  accion,
  enviando,
  videoRef,
  onCancelar,
  onCapturar,
}: {
  accion: ConFoto;
  enviando: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onCancelar: () => void;
  onCapturar: () => void;
}) {
  return (
    <div className="bg-stadium -m-4 flex min-h-[calc(100vh-3.5rem)] flex-col md:-m-8 md:rounded-2xl md:p-2">
      <div className="flex items-center gap-3 p-4">
        <button
          type="button"
          onClick={onCancelar}
          disabled={enviando}
          className="flex items-center gap-1.5 text-sm text-white/70 transition-colors hover:text-white disabled:opacity-50"
        >
          <X className="size-[18px]" />
          Cancelar
        </button>
        <span className="text-primary ml-auto text-[11px] font-bold tracking-[0.09em] uppercase">
          Foto de {accion === "entrada" ? "entrada" : "salida"}
        </span>
      </div>

      <div className="relative mx-4 aspect-square max-h-[470px] overflow-hidden rounded-[18px] bg-black/40">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="size-full scale-x-[-1] object-cover"
        />
        {/* Guía para el rostro: un óvalo se entiende sin leer nada */}
        <div
          aria-hidden
          className="border-primary/55 pointer-events-none absolute top-[46%] left-1/2 h-[62%] w-[54%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-2 border-dashed"
        />
        <p className="absolute inset-x-0 bottom-5 text-center text-[13px] text-white/75">
          Centra tu cara en el óvalo
        </p>
      </div>

      <div className="flex flex-col items-center gap-4 px-4 pt-8 pb-10">
        <button
          type="button"
          onClick={onCapturar}
          disabled={enviando}
          aria-label="Tomar la foto"
          className="bg-primary ring-primary/30 flex size-[86px] items-center justify-center rounded-full ring-4 transition-transform active:scale-95 disabled:opacity-60"
          style={{ boxShadow: "0 0 40px -6px rgba(212,225,87,0.45)" }}
        >
          <Camera className="text-primary-foreground size-[30px]" />
        </button>
        <p className="font-heading text-[15px] font-semibold text-white/90">
          {enviando ? "Guardando…" : "Toca para tomar la foto"}
        </p>
        <p className="max-w-[250px] text-center text-xs leading-[18px] text-white/45">
          Tu hora queda registrada al tomarla. La foto se guarda {FOTOS_DIAS} días y solo la ve
          el administrador.
        </p>
      </div>
    </div>
  );
}

/** Por qué no se pudo abrir la cámara, y qué hacer. Separada por lo mismo. */
export function VistaFallo({
  fallo,
  onReintentar,
}: {
  fallo: FalloCamara;
  onReintentar: () => void;
}) {
  const t = TEXTO_FALLO[fallo];
  return (
    <div className="mx-auto flex max-w-md flex-col justify-center gap-5 py-6">
      <div className="bg-card ring-foreground/[0.06] rounded-xl p-6 shadow-sm ring-1">
        <span className="bg-warning/15 flex size-12 items-center justify-center rounded-2xl">
          <CameraOff className="size-6 text-[#8a5600]" />
        </span>
        <h2 className="font-heading mt-4 text-lg leading-tight font-bold tracking-tight">
          {t.titulo}
        </h2>
        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{t.detalle}</p>

        {fallo === "bloqueada" && (
          <ol className="border-border mt-5 space-y-3 border-t pt-4">
            <li className="flex gap-3">
              <span className="bg-muted text-muted-foreground font-heading flex size-[22px] shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums">
                1
              </span>
              <span className="text-sm leading-relaxed">
                Toca el candado de la barra de direcciones del navegador.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="bg-muted text-muted-foreground font-heading flex size-[22px] shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums">
                2
              </span>
              <span className="text-sm leading-relaxed">
                Activa <strong className="font-semibold">Cámara</strong> y vuelve a intentar.
              </span>
            </li>
          </ol>
        )}

        <Button size="lg" className="mt-6 h-12 w-full text-base" onClick={onReintentar}>
          <RotateCcw />
          Volver a intentar
        </Button>
      </div>

      <div className="bg-card ring-foreground/[0.06] flex gap-3 rounded-xl p-4 shadow-sm ring-1">
        <Monitor className="text-muted-foreground mt-0.5 size-[18px] shrink-0" />
        <p className="text-muted-foreground text-[13px] leading-relaxed">
          <strong className="text-foreground font-semibold">¿Sigue sin funcionar?</strong> Marca
          en el computador de recepción con tu PIN. Cuenta igual.
        </p>
      </div>
    </div>
  );
}
