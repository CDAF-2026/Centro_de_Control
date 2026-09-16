"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check } from "lucide-react";
import { prepararCobro, cambiarCobroClase, type PrepararCobro } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const SELECT = "border-input bg-background mt-1 h-9 w-full rounded-md border px-2 text-sm";
/** Cuánto se deja ver la confirmación antes de cerrar el modal. */
const MS_CONFIRMACION = 2000;

/**
 * Muestra cómo se cobra una clase individual y deja cambiarlo.
 *
 * Nace de dos cosas, y la primera es la que de verdad dolió: **la pantalla no
 * distinguía una clase de paquete de una particular**. El subtítulo decía
 * "Clase individual" en las dos, así que la clase de Karent Coronado —ya
 * corregida y bien atada a su paquete— seguía leyéndose como particular. El
 * dato estaba bien y la pantalla mentía, que es peor que un dato malo: invita a
 * "arreglar" lo que ya está arreglado.
 *
 * La segunda: registrar mal no tenía vuelta atrás. Si cafetería pulsaba
 * "Particular" donde iba paquete, la única salida era borrar la clase y
 * volverla a crear.
 */
export function CobroClaseForm({
  claseId,
  modo,
  paqueteLabel,
  valor,
  editable,
  aviso,
  cerrada,
  onGuardado,
}: {
  claseId: number;
  modo: "paquete" | "particular";
  paqueteLabel: string | null;
  valor: number;
  editable: boolean;
  aviso: string | null;
  cerrada: boolean;
  onGuardado?: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [pending, start] = useTransition();
  const [data, setData] = useState<PrepararCobro | null>(null);
  const [destino, setDestino] = useState<"paquete" | "particular">(modo === "paquete" ? "particular" : "paquete");
  const [paqueteId, setPaqueteId] = useState("");
  const [precio, setPrecio] = useState(String(valor || 0));
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const cerrarRef = useRef(onGuardado);
  cerrarRef.current = onGuardado;

  useEffect(() => {
    if (!ok) return;
    const t = setTimeout(() => cerrarRef.current?.(), MS_CONFIRMACION);
    return () => clearTimeout(t);
  }, [ok]);

  function abrir() {
    setAbierto(true);
    setErr(null);
    if (data) return;
    start(async () => {
      const r = await prepararCobro(claseId);
      setData(r);
      // Se pre-escoge el primero que NO sea el actual: mover la clase al mismo
      // paquete del que ya sale no cambia nada y la acción lo rechaza.
      const otro = r.paquetes.find((p) => p.label !== paqueteLabel);
      setPaqueteId(otro ? String(otro.id) : r.paquetes[0] ? String(r.paquetes[0].id) : "");
    });
  }

  function confirmar() {
    setErr(null);
    start(async () => {
      const r = await cambiarCobroClase({
        claseId,
        modo: destino,
        paqueteClienteId: destino === "paquete" ? Number(paqueteId) : null,
        precio: destino === "particular" ? Number(precio || 0) : 0,
      });
      if (r.error) setErr(r.error);
      else {
        setOk(r.ok ?? "Listo.");
        setAbierto(false);
      }
    });
  }

  if (ok) {
    return (
      <div className="border-t pt-3">
        <p className="text-primary flex items-center justify-center gap-2 py-1 text-center text-sm font-medium">
          <Check className="size-4 shrink-0" />
          {ok}
        </p>
      </div>
    );
  }

  const sinPaquetes = !!data && !data.error && data.paquetes.length === 0;

  return (
    <div className="border-t pt-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="text-muted-foreground text-sm">Cobro</span>
        <span className="flex items-center gap-2 text-right">
          <span className="font-semibold">{modo === "paquete" ? "Paquete" : "Particular"}</span>
          {editable && !abierto && (
            <Button type="button" size="sm" variant="ghost" onClick={abrir}>
              Cambiar
            </Button>
          )}
        </span>
      </div>

      {/* De qué paquete sale. Es lo que faltaba para poder creerle a la pantalla. */}
      {modo === "paquete" && paqueteLabel && (
        <p className="text-muted-foreground mt-0.5 text-right text-xs">{paqueteLabel}</p>
      )}

      {abierto && (
        <div className="mt-2 space-y-2">
          {pending && !data ? (
            <p className="text-muted-foreground text-xs">Cargando paquetes…</p>
          ) : data?.error ? (
            <p className="text-destructive text-xs">{data.error}</p>
          ) : (
            <>
              {data?.clienteNombre && (
                <p className="text-muted-foreground text-xs">Cliente: {data.clienteNombre}</p>
              )}

              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={destino === "paquete" ? "default" : "outline"}
                  onClick={() => setDestino("paquete")}
                  disabled={pending}
                >
                  A un paquete
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={destino === "particular" ? "default" : "outline"}
                  onClick={() => setDestino("particular")}
                  disabled={pending || modo === "particular"}
                >
                  Particular
                </Button>
              </div>

              {destino === "paquete" ? (
                sinPaquetes ? (
                  <p className="text-sm">
                    Este cliente no tiene ningún paquete activo con saldo.
                    {data?.clienteId && (
                      <>
                        {" "}
                        Asígnale uno en su{" "}
                        <a className="underline" href={`/clientes/${data.clienteId}`}>
                          ficha
                        </a>
                        .
                      </>
                    )}
                  </p>
                ) : (
                  <label className="block text-xs">
                    Paquete
                    <select
                      value={paqueteId}
                      onChange={(e) => setPaqueteId(e.target.value)}
                      className={SELECT}
                      disabled={pending}
                    >
                      {(data?.paquetes ?? []).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )
              ) : (
                <label className="block text-xs">
                  Valor a cobrar (COP)
                  <Input
                    value={precio}
                    onChange={(e) => setPrecio(e.target.value)}
                    inputMode="numeric"
                    placeholder="Ej: 150000"
                    className="mt-1 max-w-[10rem]"
                  />
                </label>
              )}

              {/* Cerrada o no cambia lo que pasa con el saldo, así que se dice.
                  Confundir las dos fue lo que produjo el doble descuento en el
                  paquete de Karent. */}
              <p className="text-muted-foreground text-xs">
                {destino === "paquete"
                  ? cerrada
                    ? "La clase ya está cerrada: se le descuenta una al paquete ahora mismo."
                    : "Se le descontará al paquete cuando se cierre la clase."
                  : cerrada
                    ? `La clase ya está cerrada: se le devuelve una al paquete y pasa a cobrarse ${COP.format(Number(precio) || 0)}.`
                    : "Deja de ir contra el paquete y pasa a cobrarse aparte."}
              </p>

              {err && <p className="text-destructive text-xs">{err}</p>}

              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={confirmar}
                  disabled={pending || (destino === "paquete" && !paqueteId)}
                >
                  {pending ? "Guardando…" : "Confirmar"}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setAbierto(false)} disabled={pending}>
                  Cancelar
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {aviso && !abierto && <p className="text-muted-foreground mt-1.5 text-xs">{aviso}</p>}
    </div>
  );
}
