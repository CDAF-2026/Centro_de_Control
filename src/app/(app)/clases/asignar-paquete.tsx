"use client";

import { useState, useTransition } from "react";
import { prepararAsignacion, materializarReserva, type PrepararAsignacion } from "./actions";
import { Button } from "@/components/ui/button";
import type { CalEvento } from "./types";

type Modo = "paquete" | "particular";
const SELECT = "border-input bg-background mt-1 h-9 w-full rounded-md border px-2 text-sm";

export function MaterializarReserva({ ev }: { ev: CalEvento }) {
  const ec = ev.ec!;
  const [pending, start] = useTransition();
  const [modo, setModo] = useState<Modo | null>(null);
  const [data, setData] = useState<PrepararAsignacion | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [paqueteId, setPaqueteId] = useState("");
  const [profesorId, setProfesorId] = useState("");
  const [precio, setPrecio] = useState("0");

  function abrir(m: Modo) {
    setErr(null);
    setModo(m);
    if (data) {
      if (m === "paquete") setPaqueteId(data.paquetes[0] ? String(data.paquetes[0].id) : "");
      return;
    }
    start(async () => {
      const r = await prepararAsignacion(ec.email);
      setData(r);
      const match = r.profesores.find((p) => p.nombre === ec.profesorMatched);
      setProfesorId(match?.id ?? "");
      setPaqueteId(r.paquetes[0] ? String(r.paquetes[0].id) : "");
    });
  }

  function confirmar() {
    setErr(null);
    start(async () => {
      const r = await materializarReserva({
        modo: modo!,
        bookingId: ec.bookingId,
        email: ec.email,
        nombres: ec.nombres,
        apellidos: ec.apellidos,
        telefono: ec.telefono,
        fecha: ev.fecha,
        horaInicio: ev.hora,
        horaFin: ev.horaFin,
        deporte: ev.deporte,
        cancha: ev.cancha ?? "",
        paqueteClienteId: modo === "paquete" ? Number(paqueteId) : null,
        precio: modo === "particular" ? Number(precio || 0) : 0,
        profesorId,
      });
      if (r.error) setErr(r.error);
      else setOk(r.ok ?? "Listo.");
    });
  }

  if (ok) {
    return <p className="border-lime/50 bg-lime/10 mt-3 rounded-md border px-3 py-2 text-sm">✓ {ok}</p>;
  }

  const sinPaquetes = !!data && data.paquetes.length === 0;

  return (
    <div className="mt-3 space-y-2 border-t pt-3">
      <p className="text-sm font-medium">Registrar para poder cerrarla</p>
      <div className="flex gap-2">
        <Button type="button" size="sm" variant={modo === "paquete" ? "default" : "outline"} onClick={() => abrir("paquete")} disabled={pending}>
          A un paquete
        </Button>
        <Button type="button" size="sm" variant={modo === "particular" ? "default" : "outline"} onClick={() => abrir("particular")} disabled={pending}>
          Particular
        </Button>
      </div>

      {err && <p className="text-destructive text-sm">{err}</p>}

      {modo && data && (
        <div className="space-y-2">
          {data.clienteNombre ? (
            <p className="text-muted-foreground text-xs">Cliente: {data.clienteNombre}</p>
          ) : ec.email ? (
            <p className="text-muted-foreground text-xs">Cliente nuevo (se creará): {ec.email}</p>
          ) : (
            <p className="text-muted-foreground text-xs">Sin correo: la clase quedará sin cliente.</p>
          )}

          <label className="block text-xs">
            Profesor
            <select value={profesorId} onChange={(e) => setProfesorId(e.target.value)} className={SELECT}>
              <option value="">— Sin asignar —</option>
              {data.profesores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </label>

          {modo === "paquete" ? (
            data.sinCorreo ? (
              <p className="text-sm">Esta reserva no tiene correo; no se puede usar paquete. Usa <button type="button" className="underline" onClick={() => abrir("particular")}>Particular</button>.</p>
            ) : sinPaquetes ? (
              <p className="text-sm">
                {data.sinCliente
                  ? "No hay un cliente con ese correo todavía. "
                  : "Este cliente no tiene paquete activo. "}
                {data.clienteId && (<>Asígnale uno en su <a className="underline" href={`/clientes/${data.clienteId}`}>ficha</a>, o </>)}
                usa <button type="button" className="underline" onClick={() => abrir("particular")}>Particular</button>.
              </p>
            ) : (
              <label className="block text-xs">
                Paquete
                <select value={paqueteId} onChange={(e) => setPaqueteId(e.target.value)} className={SELECT}>
                  {data.paquetes.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </label>
            )
          ) : (
            <label className="block text-xs">
              Precio (COP, opcional)
              <input type="number" min={0} value={precio} onChange={(e) => setPrecio(e.target.value)} className={SELECT} />
            </label>
          )}

          {!(modo === "paquete" && (data.sinCorreo || sinPaquetes)) && (
            <Button type="button" size="sm" onClick={confirmar} disabled={pending || (modo === "paquete" && !paqueteId)}>
              {pending ? "Guardando…" : modo === "paquete" ? "Confirmar y asignar" : "Confirmar clase particular"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
