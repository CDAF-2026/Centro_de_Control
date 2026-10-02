"use client";

import { useEffect, useRef, useState } from "react";
import SignaturePad from "signature_pad";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * El recuadro de la firma (plan §4.6). Un solo lienzo para dedo, lápiz, mouse y
 * trackpad; y la alternativa "Escribir mi nombre" para quien está en un computador
 * y no quiere garabatear con el ratón. Las dos producen un PNG transparente que
 * viaja en el campo oculto `firmaPng`, con el método en `metodo`.
 *
 * - Arranca SIEMPRE en "dibujar" (Laura, 2-oct-2026), también en computador.
 * - `touch-action: none` en el lienzo: si no, el celular desplaza la página al firmar.
 * - Se escala al `devicePixelRatio` (si no, en pantallas retina sale pixelada) y se
 *   vuelve a escalar al cambiar el tamaño.
 * - Un punto no es una firma: se exige un trazo mínimo antes de habilitar "Firmar".
 */
type Modo = "dibujada" | "escrita";

export function FirmaPad({
  nombreSugerido,
  modoInicial = "dibujada",
  onCambio,
}: {
  nombreSugerido: string;
  modoInicial?: Modo;
  /** Avisa si ya hay una firma válida (para habilitar el botón de enviar). */
  onCambio?: (valida: boolean) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);
  const [modo, setModo] = useState<Modo>(modoInicial);
  const [nombre, setNombre] = useState(nombreSugerido);
  const [png, setPng] = useState("");
  const [editado, setEditado] = useState(false);

  // El nombre del firmante se escribe ARRIBA, después de montar este componente:
  // se sigue en vivo mientras la persona no lo haya tocado aquí.
  useEffect(() => {
    if (!editado) setNombre(nombreSugerido);
  }, [nombreSugerido, editado]);

  useEffect(() => {
    if (modo !== "dibujada") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pad = new SignaturePad(canvas, { minWidth: 1, maxWidth: 2.5, penColor: "#1a1c1e" });
    padRef.current = pad;

    const redimensionar = () => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      canvas.getContext("2d")?.scale(ratio, ratio);
      pad.clear();
      setPng("");
      onCambio?.(false);
    };
    redimensionar();
    window.addEventListener("resize", redimensionar);

    const alSoltar = () => {
      // Un punto no es una firma: se exige un recorrido mínimo (la longitud de los
      // trazos, en px). Se mide longitud y no cantidad de puntos porque un trazo
      // rápido trae pocos puntos aunque sea largo.
      const largo = pad.toData().reduce((total, t) => {
        let l = 0;
        for (let i = 1; i < t.points.length; i++) {
          l += Math.hypot(t.points[i].x - t.points[i - 1].x, t.points[i].y - t.points[i - 1].y);
        }
        return total + l;
      }, 0);
      if (pad.isEmpty() || largo < 40) {
        setPng("");
        onCambio?.(false);
        return;
      }
      setPng(pad.toDataURL("image/png"));
      onCambio?.(true);
    };
    pad.addEventListener("endStroke", alSoltar);

    return () => {
      pad.removeEventListener("endStroke", alSoltar);
      window.removeEventListener("resize", redimensionar);
      pad.off();
      padRef.current = null;
    };
  }, [modo, onCambio]);

  // Modo escrito: el nombre se pinta en un lienzo fuera de pantalla con una fuente manuscrita.
  useEffect(() => {
    if (modo !== "escrita") return;
    const limpio = nombre.trim();
    if (limpio.length < 3) {
      setPng("");
      onCambio?.(false);
      return;
    }
    const c = document.createElement("canvas");
    const ratio = 2;
    c.width = 520 * ratio;
    c.height = 140 * ratio;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.fillStyle = "#1a1c1e";
    ctx.font = "italic 44px 'Brush Script MT', 'Snell Roundhand', 'Segoe Script', cursive";
    ctx.textBaseline = "middle";
    ctx.fillText(limpio, 16, 70, 490);
    setPng(c.toDataURL("image/png"));
    onCambio?.(true);
  }, [modo, nombre, onCambio]);

  const limpiar = () => {
    padRef.current?.clear();
    setPng("");
    onCambio?.(false);
  };

  return (
    <div className="space-y-3">
      <input type="hidden" name="metodo" value={modo} />
      <input type="hidden" name="firmaPng" value={png} />

      <div className="bg-muted grid grid-cols-2 gap-1 rounded-xl p-1 text-sm" role="tablist">
        {(["dibujada", "escrita"] as Modo[]).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={modo === m}
            onClick={() => setModo(m)}
            className={cn(
              "h-[42px] rounded-[9px] font-semibold transition-colors",
              modo === m ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {m === "dibujada" ? "Dibujar mi firma" : "Escribir mi nombre"}
          </button>
        ))}
      </div>

      {modo === "dibujada" ? (
        <div className="space-y-2">
          <div className="relative">
            <canvas
              ref={canvasRef}
              aria-label="Área para firmar"
              className="h-48 w-full rounded-[14px] border-2 border-dashed border-[#b9c3c0] bg-[#fafbfa]"
              style={{ touchAction: "none", userSelect: "none", WebkitUserSelect: "none" }}
            />
            {/* La línea de firma y la ayuda van DEBAJO del lienzo (pointer-events: none): no estorban al trazo. */}
            <div aria-hidden className="pointer-events-none absolute inset-x-6 bottom-11 h-px bg-[#c9d2cf]" />
            <span aria-hidden className="text-muted-foreground pointer-events-none absolute bottom-[50px] left-[22px] text-lg">×</span>
            {!png && <span aria-hidden className="text-muted-foreground pointer-events-none absolute inset-0 flex items-center justify-center text-sm">Firma aquí con el dedo</span>}
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-muted-foreground text-xs">Si te queda fea, no importa: puedes repetirla.</p>
            <Button type="button" variant="ghost" size="sm" onClick={limpiar} className="shrink-0">Borrar</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="firma-nombre">Escribe tu nombre completo como firma</Label>
          <Input id="firma-nombre" value={nombre} onChange={(e) => { setEditado(true); setNombre(e.target.value); }} autoComplete="name" className="h-12 rounded-[10px] border-[1.5px] px-3.5 text-[15px] md:text-[15px]" />
          {png && (
            <div className="rounded-[14px] border-2 border-dashed border-[#b9c3c0] bg-[#fafbfa] p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={png} alt="Vista previa de la firma" className="mx-auto h-20 object-contain" />
            </div>
          )}
          <p className="text-muted-foreground text-xs">Tu nombre escrito queda como firma electrónica, con la misma evidencia.</p>
        </div>
      )}
      <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
        <svg className="mt-0.5 size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>
        La fecha, la hora y el dispositivo quedan registrados como evidencia de la firma.
      </p>
    </div>
  );
}
