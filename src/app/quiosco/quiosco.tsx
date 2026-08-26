"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Check, ChevronLeft, Delete, Lock, Utensils, X } from "lucide-react";
import { iniciales } from "@/lib/avatar";
import { horaCorta } from "@/lib/fecha";
import { marcarQuiosco, verificarPin, type QuioscoState } from "./actions";
import type { QuioscoEstado, TurnoAccion } from "@/lib/database.types";

/** Lado de la foto guardada, igual que en la pantalla del celular. */
const LADO = 640;
/** Si alguien se va a mitad, la pantalla vuelve sola a la lista. */
const INACTIVIDAD_MS = 45_000;
/** Cuánto se queda el "listo" antes de volver. */
const LISTO_MS = 3_500;

type Paso = "lista" | "accion" | "pin" | "camara" | "listo";

const ROTULO: Record<TurnoAccion, string> = {
  entrada: "Iniciar turno",
  salida: "Cerrar turno",
  pausa_inicio: "Salgo a almorzar",
  pausa_fin: "Regresé del almuerzo",
};

/** Qué puede hacer esta persona ahora mismo, según su turno. */
function accionesDe(p: QuioscoEstado): TurnoAccion[] {
  if (p.turno_id === null) return ["entrada"];
  if (p.pausa_abierta) return ["pausa_fin"];
  return ["salida", "pausa_inicio"];
}

const CON_FOTO: TurnoAccion[] = ["entrada", "salida"];

export function Quiosco({ gente, fecha }: { gente: QuioscoEstado[]; fecha: string }) {
  const [paso, setPaso] = useState<Paso>("lista");
  const [persona, setPersona] = useState<QuioscoEstado | null>(null);
  const [accion, setAccion] = useState<TurnoAccion | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [listo, setListo] = useState("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const cerrarStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const volver = useCallback(() => {
    cerrarStream();
    setPaso("lista");
    setPersona(null);
    setAccion(null);
    setPin("");
    setError("");
    setListo("");
  }, [cerrarStream]);

  // Es una pantalla compartida: no puede quedarse con un PIN a medio escribir
  // porque alguien se fue. Cualquier toque reinicia la cuenta.
  useEffect(() => {
    if (paso === "lista") return;
    let t = window.setTimeout(volver, INACTIVIDAD_MS);
    const reiniciar = () => {
      window.clearTimeout(t);
      t = window.setTimeout(volver, INACTIVIDAD_MS);
    };
    window.addEventListener("pointerdown", reiniciar);
    window.addEventListener("keydown", reiniciar);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("pointerdown", reiniciar);
      window.removeEventListener("keydown", reiniciar);
    };
  }, [paso, volver]);

  useEffect(() => {
    if (paso !== "listo") return;
    const t = window.setTimeout(volver, LISTO_MS);
    return () => window.clearTimeout(t);
  }, [paso, volver]);

  useEffect(() => () => cerrarStream(), [cerrarStream]);

  useEffect(() => {
    const v = videoRef.current;
    const s = streamRef.current;
    if (paso !== "camara" || !v || !s) return;
    v.srcObject = s;
    void v.play().catch(() => {});
  }, [paso]);

  function elegir(p: QuioscoEstado) {
    if (!p.tiene_pin) return;
    setPersona(p);
    setError("");
    const posibles = accionesDe(p);
    // Con una sola acción posible no tiene sentido una pantalla para escogerla.
    if (posibles.length === 1) {
      setAccion(posibles[0]);
      setPaso("pin");
    } else {
      setPaso("accion");
    }
  }

  async function confirmarPin(codigo: string) {
    if (!persona || !accion || enviando) return;
    setEnviando(true);
    const datos = new FormData();
    datos.append("perfil", persona.perfil_id);
    datos.append("pin", codigo);
    const r: QuioscoState = await verificarPin(datos);
    setEnviando(false);
    if (!r.ok) {
      setPin("");
      setError(r.mensaje);
      return;
    }
    setError("");
    if (CON_FOTO.includes(accion)) await abrirCamara();
    else await marcar(codigo, null);
  }

  async function abrirCamara() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(
        window.isSecureContext
          ? "No se pudo abrir la cámara de este computador."
          : "La cámara solo funciona en conexiones seguras (https).",
      );
      return;
    }
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 1280 } },
        audio: false,
      });
      setPaso("camara");
    } catch {
      setError("No se pudo abrir la cámara. Avísale al administrador.");
    }
  }

  async function marcar(codigo: string, foto: Blob | null) {
    if (!persona || !accion) return;
    setEnviando(true);
    const datos = new FormData();
    datos.append("perfil", persona.perfil_id);
    datos.append("pin", codigo);
    datos.append("accion", accion);
    if (foto) datos.append("foto", foto, "turno.jpg");
    const r = await marcarQuiosco(datos);
    setEnviando(false);
    cerrarStream();
    if (!r.ok) {
      setPin("");
      setError(r.mensaje);
      setPaso("pin");
      return;
    }
    setListo(r.mensaje);
    setPaso("listo");
  }

  async function capturar() {
    const v = videoRef.current;
    if (!v || enviando) return;
    const lado = Math.min(v.videoWidth, v.videoHeight);
    if (!lado) return;
    const lienzo = document.createElement("canvas");
    lienzo.width = LADO;
    lienzo.height = LADO;
    const ctx = lienzo.getContext("2d");
    if (!ctx) return;
    // Sin espejo: el visor sí va espejado (CSS), la foto guardada es la real.
    ctx.drawImage(v, (v.videoWidth - lado) / 2, (v.videoHeight - lado) / 2, lado, lado, 0, 0, LADO, LADO);
    const foto = await new Promise<Blob | null>((res) => lienzo.toBlob(res, "image/jpeg", 0.82));
    if (!foto) {
      setError("No se pudo tomar la foto. Vuelve a intentar.");
      return;
    }
    await marcar(pin, foto);
  }

  return (
    <div className="bg-stadium text-sidebar-foreground relative flex min-h-screen flex-col overflow-hidden">
      <span
        aria-hidden
        className="bg-primary/10 pointer-events-none absolute -top-40 -right-32 size-[520px] rounded-full blur-[90px]"
      />

      {paso === "lista" && (
        <>
          <Cabecera titulo="Marcar turno" fecha={fecha} />
          <div className="relative flex flex-1 flex-wrap items-center justify-center gap-5 px-10">
            {gente.length === 0 ? (
              <p className="text-lg text-white/50">Nadie tiene el registro de turnos activado.</p>
            ) : (
              gente.map((p) => <Tarjeta key={p.perfil_id} persona={p} onElegir={() => elegir(p)} />)
            )}
          </div>
          <p className="relative px-10 pb-10 text-center text-[15px] text-white/40">
            Toca tu nombre para marcar
          </p>
        </>
      )}

      {paso !== "lista" && persona && (
        <>
          <CabeceraVuelta
            onVolver={volver}
            etiqueta={paso === "camara" ? `Foto · ${persona.nombre}` : undefined}
            cerrar={paso === "camara"}
          />

          {paso === "accion" && (
            <VistaAcciones
              persona={persona}
              onElegir={(a) => {
                setAccion(a);
                setPaso("pin");
              }}
            />
          )}

          {paso === "pin" && (
            <VistaPin
              nombre={(persona.nombre ?? "").split(" ")[0]}
              rotulo={accion ? ROTULO[accion] : ""}
              pin={pin}
              error={error}
              enviando={enviando}
              onDigito={(d) => {
                setError("");
                const nuevo = (pin + d).slice(0, 4);
                setPin(nuevo);
                if (nuevo.length === 4) void confirmarPin(nuevo);
              }}
              onBorrar={() => {
                setError("");
                setPin(pin.slice(0, -1));
              }}
            />
          )}

          {paso === "camara" && (
            <VistaCamaraQuiosco
              accion={accion === "entrada" ? "entrada" : "salida"}
              enviando={enviando}
              videoRef={videoRef}
              onCapturar={capturar}
            />
          )}

          {paso === "listo" && <VistaListo nombre={(persona.nombre ?? "").split(" ")[0]} mensaje={listo} />}
        </>
      )}
    </div>
  );
}

/* ─────────────────────────── Piezas ─────────────────────────── */

/** El reloj arranca vacío y se llena al montar: el servidor y el navegador no
 *  marcan el mismo segundo, y pintarlo en servidor rompería la hidratación. */
function Reloj({ grande = false }: { grande?: boolean }) {
  const [hora, setHora] = useState<string | null>(null);
  useEffect(() => {
    const tic = () => setHora(horaCorta(new Date().toISOString()));
    tic();
    const t = window.setInterval(tic, 10_000);
    return () => window.clearInterval(t);
  }, []);

  const [h, sufijo] = (hora ?? " ").split(/\s(?=[ap]\.)/);
  return (
    <span
      className={`font-heading text-primary font-extrabold tracking-tight tabular-nums ${
        grande ? "text-[56px] leading-[52px]" : "text-3xl leading-none"
      }`}
    >
      {h}
      {sufijo && (
        <span className={`text-primary/60 ${grande ? "text-2xl" : "text-[15px]"}`}> {sufijo}</span>
      )}
    </span>
  );
}

function Cabecera({ titulo, fecha }: { titulo: string; fecha: string }) {
  return (
    <div className="relative flex items-start justify-between px-10 pt-8">
      <div>
        <p className="text-[11px] font-bold tracking-[0.12em] text-white/45 uppercase">
          Centro Deportivo Alejandro Falla
        </p>
        <p className="font-display mt-2 text-[34px] leading-9 font-black tracking-tight uppercase italic">
          {titulo}
        </p>
      </div>
      <div className="text-right">
        <Reloj grande />
        <p className="mt-2 text-[15px] text-white/50">{fecha}</p>
      </div>
    </div>
  );
}

function CabeceraVuelta({
  onVolver,
  etiqueta,
  cerrar,
}: {
  onVolver: () => void;
  etiqueta?: string;
  cerrar?: boolean;
}) {
  return (
    <div className="relative flex items-start justify-between px-10 pt-8">
      <button
        type="button"
        onClick={onVolver}
        className="flex items-center gap-2 text-base text-white/55 transition-colors hover:text-white"
      >
        {cerrar ? <X className="size-5" /> : <ChevronLeft className="size-5" />}
        {cerrar ? "Cancelar" : "Volver"}
      </button>
      {etiqueta ? (
        <span className="text-primary text-[11px] font-bold tracking-[0.12em] uppercase">
          {etiqueta}
        </span>
      ) : (
        <Reloj />
      )}
    </div>
  );
}

export function Tarjeta({
  persona,
  onElegir,
}: {
  persona: QuioscoEstado;
  onElegir: () => void;
}) {
  const enTurno = persona.turno_id !== null;
  const enPausa = persona.pausa_abierta;
  const partes = (persona.nombre ?? "").trim().split(/\s+/);
  const nombre = partes.slice(0, partes.length > 2 ? 2 : 1).join(" ");
  const apellido = partes.slice(partes.length > 2 ? 2 : 1).join(" ");

  const marco = enPausa
    ? "bg-warning/[0.06] ring-warning/30"
    : enTurno
      ? "bg-primary/[0.07] ring-primary/30"
      : "bg-white/5 ring-white/10";

  return (
    <button
      type="button"
      onClick={onElegir}
      disabled={!persona.tiene_pin}
      className={`w-[268px] rounded-[20px] px-6 py-7 text-center ring-1 transition-transform ${marco} ${
        persona.tiene_pin ? "hover:scale-[1.02] active:scale-100" : "cursor-not-allowed opacity-55"
      }`}
    >
      <span
        className={`font-heading mx-auto flex size-21 items-center justify-center rounded-full text-[28px] font-bold ${
          enPausa
            ? "bg-warning/20 text-warning"
            : enTurno
              ? "bg-primary text-primary-foreground"
              : "bg-white/10 text-white/60"
        }`}
      >
        {iniciales(persona.nombre ?? "?")}
      </span>
      <span className="font-heading mt-4 block text-xl font-bold tracking-tight">{nombre}</span>
      <span className="block text-sm text-white/45">{apellido}</span>

      <span
        className={`mt-4 inline-flex h-7 items-center gap-2 rounded-full px-3 text-[13px] ${
          enPausa
            ? "bg-warning/15 text-warning"
            : enTurno
              ? "bg-primary/15 text-primary"
              : "bg-white/[0.06] text-white/50"
        }`}
      >
        {enPausa ? (
          <>
            <Utensils className="size-3" />
            Almorzando
          </>
        ) : enTurno ? (
          <>
            <span className="bg-primary size-1.5 rounded-full" />
            <span className="tabular-nums">Desde {horaCorta(persona.inicio_el!)}</span>
          </>
        ) : (
          <>
            <span className="size-1.5 rounded-full bg-white/30" />
            Sin turno
          </>
        )}
      </span>

      {!persona.tiene_pin && (
        <span className="mt-3 block text-xs leading-relaxed text-white/40">
          Sin PIN — marca desde tu celular
        </span>
      )}
    </button>
  );
}

export function VistaAcciones({
  persona,
  onElegir,
}: {
  persona: QuioscoEstado;
  onElegir: (a: TurnoAccion) => void;
}) {
  const enPausa = persona.pausa_abierta;
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center px-10 pb-16">
      <span
        className={`font-heading flex size-27 items-center justify-center rounded-full text-4xl font-bold ${
          enPausa ? "bg-warning/20 text-warning" : "bg-primary text-primary-foreground"
        }`}
      >
        {iniciales(persona.nombre ?? "?")}
      </span>
      <p className="font-heading mt-5 text-[34px] font-extrabold tracking-tight">{persona.nombre}</p>
      <span
        className={`mt-3 inline-flex h-8 items-center gap-2 rounded-full px-3.5 text-[15px] tabular-nums ${
          enPausa ? "bg-warning/15 text-warning" : "bg-primary/15 text-primary"
        }`}
      >
        {enPausa ? "En almuerzo" : `En turno desde las ${horaCorta(persona.inicio_el!)}`}
      </span>

      <div className="mt-11 flex gap-4">
        {accionesDe(persona).map((a, i) => (
          <button
            key={a}
            type="button"
            onClick={() => onElegir(a)}
            className={`font-heading flex h-21 w-[300px] items-center justify-center gap-3 rounded-2xl text-[21px] font-extrabold transition-transform active:scale-[0.98] ${
              i === 0
                ? "bg-primary text-primary-foreground"
                : "border border-white/25 text-[19px] font-semibold text-white"
            }`}
          >
            {a === "pausa_inicio" || a === "pausa_fin" ? (
              <Utensils className="size-[22px]" />
            ) : (
              <Camera className="size-6" />
            )}
            {ROTULO[a]}
          </button>
        ))}
      </div>
    </div>
  );
}

export function VistaPin({
  nombre,
  rotulo,
  pin,
  error,
  enviando,
  onDigito,
  onBorrar,
}: {
  nombre: string;
  rotulo: string;
  pin: string;
  error: string;
  enviando: boolean;
  onDigito: (d: string) => void;
  onBorrar: () => void;
}) {
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center pb-10">
      <p className="text-[11px] font-bold tracking-[0.12em] text-white/45 uppercase">{rotulo}</p>
      <p className="font-heading mt-2.5 text-[26px] font-bold">
        {nombre}, escribe tu PIN
      </p>

      <div className="mt-7 flex gap-[18px]">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`size-[18px] rounded-full transition-colors ${
              i < pin.length ? "bg-primary" : "bg-white/15"
            }`}
          />
        ))}
      </div>

      {error ? (
        <div className="mt-6 flex items-center gap-2.5 rounded-xl bg-[#ffb4ab]/10 px-4 py-2.5">
          <Lock className="size-4 text-[#ffb4ab]" />
          <p className="text-[15px] text-[#ffb4ab]">{error}</p>
        </div>
      ) : (
        <p className="mt-6 h-[42px] text-[15px] text-white/40">
          {enviando ? "Un momento…" : ""}
        </p>
      )}

      <div className="mt-3 grid grid-cols-3 gap-3.5">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <TeclaPin key={d} onClick={() => onDigito(d)} disabled={enviando}>
            {d}
          </TeclaPin>
        ))}
        <span />
        <TeclaPin onClick={() => onDigito("0")} disabled={enviando}>
          0
        </TeclaPin>
        <button
          type="button"
          onClick={onBorrar}
          disabled={enviando}
          aria-label="Borrar"
          className="flex h-19 w-26 items-center justify-center rounded-2xl text-white/55 transition-colors hover:bg-white/5 disabled:opacity-40"
        >
          <Delete className="size-6" />
        </button>
      </div>
    </div>
  );
}

function TeclaPin({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="font-heading h-19 w-26 rounded-2xl bg-white/[0.07] text-[26px] font-semibold text-white tabular-nums transition-colors hover:bg-white/12 active:bg-white/15 disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export function VistaCamaraQuiosco({
  accion,
  enviando,
  videoRef,
  onCapturar,
}: {
  accion: "entrada" | "salida";
  enviando: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onCapturar: () => void;
}) {
  return (
    <div className="relative flex flex-1 items-center justify-center gap-12 px-14 pb-8">
      <div className="relative size-[400px] shrink-0 overflow-hidden rounded-3xl bg-black/40">
        <video ref={videoRef} playsInline muted autoPlay className="size-full scale-x-[-1] object-cover" />
        <div
          aria-hidden
          className="border-primary/55 pointer-events-none absolute top-[46%] left-1/2 h-[64%] w-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-2 border-dashed"
        />
      </div>

      <div className="w-[330px]">
        <p className="font-display text-3xl leading-9 font-extrabold tracking-tight">
          Mira a la cámara
        </p>
        <p className="mt-3 text-base leading-relaxed text-white/55">
          Centra tu cara en el óvalo y toca el botón. Tu hora de{" "}
          {accion === "entrada" ? "entrada" : "salida"} queda registrada al tomarla.
        </p>

        <button
          type="button"
          onClick={onCapturar}
          disabled={enviando}
          className="bg-primary text-primary-foreground font-heading mt-7 flex h-21 w-full items-center justify-center gap-3 rounded-2xl text-[22px] font-extrabold transition-transform active:scale-[0.98] disabled:opacity-60"
          style={{ boxShadow: "0 0 50px -10px rgba(212,225,87,0.5)" }}
        >
          <Camera className="size-[26px]" />
          {enviando ? "Guardando…" : "Tomar la foto"}
        </button>

        <p className="mt-4 text-[13px] leading-relaxed text-white/35">
          La foto se guarda un mes y solo la ve el administrador.
        </p>
      </div>
    </div>
  );
}

export function VistaListo({ nombre, mensaje }: { nombre: string; mensaje: string }) {
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center">
      <span
        className="bg-primary/15 flex size-33 items-center justify-center rounded-full"
        style={{ boxShadow: "0 0 70px -10px rgba(212,225,87,0.4)" }}
      >
        <Check className="text-primary size-16" strokeWidth={2.5} />
      </span>
      <p className="font-display mt-8 text-[44px] leading-tight font-black tracking-tight uppercase italic">
        Listo, {nombre}
      </p>
      <p className="mt-3.5 text-[22px] text-white/65 tabular-nums">{mensaje}</p>
      <p className="mt-11 text-sm text-white/40">volviendo a la lista…</p>
    </div>
  );
}
