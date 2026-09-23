"use client";

import { useState, useTransition } from "react";
import {
  prepararAsignacion,
  materializarReserva,
  type PrepararAsignacion,
} from "./actions";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { type CalEvento } from "./types";

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
  // Arranca con lo que EasyCancha dice que vale la reserva, no en "0": así
  // cambiar $130.000 → $150.000 (que es lo que pasa cuando van 2 personas) es
  // corregir una cifra a la vista, y no hay forma de registrar sin querer una
  // clase en $0 — que le pagaría $0 al profesor con una regla por porcentaje.
  const [precio, setPrecio] = useState(ev.ec?.monto != null ? String(Math.trunc(ev.ec.monto)) : "0");
  const [personas, setPersonas] = useState("1");
  // Alquiler de cancha: los botones salen escondidos y esto los destapa.
  const [forzarClase, setForzarClase] = useState(false);


  function abrir(m: Modo) {
    setErr(null);
    setModo(m);

    if (data) {
      if (m === "paquete") setPaqueteId(data.paquetes[0] ? String(data.paquetes[0].id) : "");
      return;
    }
    start(async () => {
      const r = await prepararAsignacion(ec.email, ec.documento);
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
              modo: modo as "paquete" | "particular",
              bookingId: ec.bookingId,
              email: ec.email,
              nombres: ec.nombres,
              apellidos: ec.apellidos,
              telefono: ec.telefono,
              documento: ec.documento,
              fecha: ev.fecha,
              horaInicio: ev.hora,
              horaFin: ev.horaFin,
              deporte: ev.deporte,
              cancha: ev.cancha ?? "",
              paqueteClienteId: modo === "paquete" ? Number(paqueteId) : null,
              precio: modo === "particular" ? Number(precio || 0) : 0,
              numAsistentes: modo === "particular" ? Number(personas || 1) : 1,
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
      {/* Ni un alquiler ni un bloqueo de academia se registran aquí: el título
          no puede pedirlo. */}
      <p className="text-sm font-medium">
        {ec.esBloqueo
          ? "Bloqueo de academia"
          : !ec.pareceClase && !forzarClase
            ? "Reserva de cancha"
            : "Registrar para poder cerrarla"}
      </p>

      {/* Alquiler de cancha: NO se ofrece convertirlo en clase.
          El 15-sep-2026 en cafetería pulsaron "Particular" sobre el alquiler de
          Iván Darío Botero y quedó de clase; salieron 5 casos iguales. Solo se
          cierran CLASES, así que un alquiler no tiene nada que hacer en la cola
          de cierre. Se esconde, no se bloquea: hay clases reales sin nota (la
          del 23-ago de Esteban venía en blanco) y bloquear dejaría al club sin
          poder registrarlas. */}
      {/* Las academias YA NO se registran desde aquí (22-sep-2026, pedido de
          Laura). Salen solas del planeador y el profesor las cierra en /cierre;
          dejar el botón solo confundía a cafetería, que no tiene nada que hacer
          con ellas. Se explica en vez de callar: un bloqueo sin acción y sin
          motivo se lee como que algo falta. */}
      {ec.esBloqueo ? (
        <p className="text-muted-foreground text-sm">
          Las clases de academia no se registran aquí: salen solas del{" "}
          <Link className="underline" href="/academias">planeador</Link> y el profesor las cierra en
          Cierre de clases.
        </p>
      ) : !ec.pareceClase && !forzarClase ? (
        <div className="space-y-1.5">
          <p className="text-muted-foreground text-sm">
            <span className="font-medium">Alquiler de cancha</span>: no se registra ni se cierra.
          </p>
          <button
            type="button"
            className="text-muted-foreground text-xs underline"
            onClick={() => setForzarClase(true)}
          >
            Sí fue una clase
          </button>
        </div>
      ) : (
        <>
          {!ec.esBloqueo && !ec.pareceClase && (
            <p className="text-muted-foreground text-xs">
              Parece un alquiler: regístrala solo si se dictó clase.
            </p>
          )}
          <div className="flex gap-2">
            <Button type="button" size="sm" variant={modo === "paquete" ? "default" : "outline"} onClick={() => abrir("paquete")} disabled={pending}>
              A un paquete
            </Button>
            <Button type="button" size="sm" variant={modo === "particular" ? "default" : "outline"} onClick={() => abrir("particular")} disabled={pending}>
              Particular
            </Button>
          </div>
        </>
      )}

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
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs">
                Personas
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={personas}
                  onChange={(e) => setPersonas(e.target.value)}
                  className={SELECT}
                />
              </label>
              <label className="block text-xs">
                Precio (COP)
                <input type="number" min={0} value={precio} onChange={(e) => setPrecio(e.target.value)} className={SELECT} />
              </label>
              <p className="text-muted-foreground col-span-2 text-xs">
                El precio viene de EasyCancha. Si vinieron más personas, corrígelo aquí.
              </p>
            </div>
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
