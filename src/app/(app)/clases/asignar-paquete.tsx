"use client";

import { useState, useTransition } from "react";
import { prepararAsignacion, asignarReservaAPaquete, type PrepararAsignacion } from "./actions";
import { Button } from "@/components/ui/button";
import type { CalEvento } from "./types";

export function AsignarPaquete({ ev }: { ev: CalEvento }) {
  const ec = ev.ec!;
  const [pending, start] = useTransition();
  const [abierto, setAbierto] = useState(false);
  const [data, setData] = useState<PrepararAsignacion | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [paqueteId, setPaqueteId] = useState("");
  const [profesorId, setProfesorId] = useState("");

  function abrir() {
    setErr(null);
    setAbierto(true);
    start(async () => {
      const r = await prepararAsignacion(ec.email);
      if (r.error) {
        setErr(r.error);
        setData(r.clienteId ? r : null);
      } else {
        setData(r);
      }
      const match = (r.profesores ?? []).find((p) => p.nombre === ec.profesorMatched);
      setProfesorId(match?.id ?? "");
      setPaqueteId((r.paquetes ?? [])[0] ? String((r.paquetes ?? [])[0].id) : "");
    });
  }

  function confirmar() {
    setErr(null);
    start(async () => {
      const r = await asignarReservaAPaquete({
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
        paqueteClienteId: Number(paqueteId),
        profesorId,
      });
      if (r.error) setErr(r.error);
      else setOk(r.ok ?? "Clase asignada.");
    });
  }

  if (ok) {
    return <p className="border-lime/50 bg-lime/10 mt-3 rounded-md border px-3 py-2 text-sm">✓ {ok}</p>;
  }

  return (
    <div className="mt-3 border-t pt-3">
      {!abierto ? (
        <Button type="button" size="sm" onClick={abrir} disabled={pending}>
          {pending ? "Cargando…" : "Asignar a paquete"}
        </Button>
      ) : (
        <div className="space-y-2">
          <p className="text-sm font-medium">Asignar a paquete</p>
          {err && <p className="text-destructive text-sm">{err}</p>}
          {data && (
            <p className="text-muted-foreground text-xs">
              Cliente: {data.clienteNombre || ec.email}
            </p>
          )}
          {data && (data.paquetes?.length ?? 0) === 0 ? (
            <p className="text-sm">
              Este cliente no tiene paquete activo. Asígnale uno en su{" "}
              <a className="underline" href={`/clientes/${data.clienteId}`}>ficha</a>.
            </p>
          ) : data ? (
            <>
              <label className="block text-xs">
                Profesor
                <select
                  value={profesorId}
                  onChange={(e) => setProfesorId(e.target.value)}
                  className="border-input bg-background mt-1 h-9 w-full rounded-md border px-2 text-sm"
                >
                  <option value="">— Sin asignar —</option>
                  {(data.profesores ?? []).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </label>
              <label className="block text-xs">
                Paquete
                <select
                  value={paqueteId}
                  onChange={(e) => setPaqueteId(e.target.value)}
                  className="border-input bg-background mt-1 h-9 w-full rounded-md border px-2 text-sm"
                >
                  {(data.paquetes ?? []).map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </label>
              <Button type="button" size="sm" onClick={confirmar} disabled={pending || !paqueteId}>
                {pending ? "Asignando…" : "Confirmar asignación"}
              </Button>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
