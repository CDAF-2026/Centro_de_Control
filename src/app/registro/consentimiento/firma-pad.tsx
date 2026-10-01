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

  // En pantallas táctiles arranca en "dibujar"; en computador, en "escribir".
  useEffect(() => {
    if (typeof window === "undefined") return;
    const tactil = window.matchMedia?.("(pointer: coarse)").matches;
    setModo(tactil ? "dibujada" : "escrita");
  }, []);

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

      <div className="bg-muted inline-flex rounded-lg p-1 text-sm">
        {(["dibujada", "escrita"] as Modo[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setModo(m)}
            className={cn(
              "rounded-md px-3 py-1.5 transition-colors",
              modo === m ? "bg-card shadow-sm font-medium" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {m === "dibujada" ? "Dibujar mi firma" : "Escribir mi nombre"}
          </button>
        ))}
      </div>

      {modo === "dibujada" ? (
        <div className="space-y-2">
          <canvas
            ref={canvasRef}
            aria-label="Área para firmar"
            className="bg-background h-44 w-full rounded-lg border-2 border-dashed"
            style={{ touchAction: "none", userSelect: "none", WebkitUserSelect: "none" }}
          />
          <div className="flex items-center justify-between">
            <p className="text-muted-foreground text-xs">Firma con el dedo, el lápiz o el ratón dentro del recuadro.</p>
            <Button type="button" variant="ghost" size="sm" onClick={limpiar}>Borrar y repetir</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="firma-nombre">Escribe tu nombre completo como firma</Label>
          <Input id="firma-nombre" value={nombre} onChange={(e) => { setEditado(true); setNombre(e.target.value); }} autoComplete="name" />
          {png && (
            <div className="bg-background rounded-lg border-2 border-dashed p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={png} alt="Vista previa de la firma" className="mx-auto h-20 object-contain" />
            </div>
          )}
          <p className="text-muted-foreground text-xs">Tu nombre escrito queda como firma electrónica, con la misma evidencia.</p>
        </div>
      )}
    </div>
  );
}
