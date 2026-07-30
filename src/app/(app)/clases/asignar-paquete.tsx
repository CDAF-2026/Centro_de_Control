"use client";

import { useState, useTransition } from "react";
import {
  prepararAsignacion,
  materializarReserva,
  prepararAcademia,
  materializarAcademia,
  type PrepararAsignacion,
  type PrepararAcademia,
  type AcademiaOpcion,
} from "./actions";
import { Button } from "@/components/ui/button";
import { aMinutos, franjasDeBloque, type CalEvento } from "./types";

type Modo = "paquete" | "particular" | "academia";
const SELECT = "border-input bg-background mt-1 h-9 w-full rounded-md border px-2 text-sm";

/** Duración configurada de la academia, en minutos (null si no tiene horario). */
function duracionAcademia(a: AcademiaOpcion | null): number | null {
  if (!a?.horaInicio || !a?.horaFin) return null;
  const i = aMinutos(a.horaInicio), f = aMinutos(a.horaFin);
  return i !== null && f !== null && f > i ? f - i : null;
}

export function MaterializarReserva({ ev }: { ev: CalEvento }) {
  const ec = ev.ec!;
  const [pending, start] = useTransition();
  const [modo, setModo] = useState<Modo | null>(null);
  const [data, setData] = useState<PrepararAsignacion | null>(null);
  const [aca, setAca] = useState<PrepararAcademia | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [paqueteId, setPaqueteId] = useState("");
  const [profesorId, setProfesorId] = useState("");
  const [precio, setPrecio] = useState("0");
  const [academiaId, setAcademiaId] = useState("");
  const [duracion, setDuracion] = useState(0); // 0 = el bloque entero como una clase

  const largoBloque = (() => {
    const i = aMinutos(ev.hora), f = aMinutos(ev.horaFin);
    return i !== null && f !== null && f > i ? f - i : 0;
  })();

  function abrir(m: Modo) {
    setErr(null);
    setModo(m);

    if (m === "academia") {
      if (aca) return;
      start(async () => {
        setAca(await prepararAcademia());
      });
      return;
    }

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

  /** Al cambiar de academia se re-sugiere su duración de referencia. */
  function cambiarAcademia(id: string) {
    setAcademiaId(id);
    const a = aca?.academias.find((x) => String(x.id) === id) ?? null;
    const d = duracionAcademia(a);
    setDuracion(d && d < largoBloque ? d : 0);
  }

  const franjas = franjasDeBloque(ev.hora, ev.horaFin, duracion);
  // La academia se escoge SIEMPRE a mano: define a quién se le cobra, y adivinarla
  // sube el margen de error (decisión de Laura, jul-2026).
  const clasesAEnviar = academiaId
    ? franjas.map((f) => ({ academiaId: Number(academiaId), inicio: f.inicio, fin: f.fin }))
    : [];

  function confirmar() {
    setErr(null);
    start(async () => {
      const r =
        modo === "academia"
          ? await materializarAcademia({
              bookingId: ec.bookingId,
              fecha: ev.fecha,
              deporte: ev.deporte,
              cancha: ev.cancha ?? "",
              profesorId,
              clases: clasesAEnviar,
            })
          : await materializarReserva({
              modo: modo as "paquete" | "particular",
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

  // Opciones de corte: el bloque entero + la duración de la academia + las usuales.
  const acaSel = aca?.academias.find((a) => String(a.id) === academiaId) ?? null;
  const dAca = duracionAcademia(acaSel);
  const cortes = [...new Set([dAca, 60, 90, 120].filter((d): d is number => !!d && d < largoBloque))]
    .sort((a, b) => a - b);

  return (
    <div className="mt-3 space-y-2 border-t pt-3">
      <p className="text-sm font-medium">Registrar para poder cerrarla</p>

      {/* Un bloqueo es cancha que el club se auto-reserva: no tiene cliente, así que
          paquete/particular no aplican (crearían un cliente "BLOQUEOS ACADEMIAS"). */}
      <div className="flex gap-2">
        {ec.esBloqueo ? (
          <Button type="button" size="sm" variant={modo === "academia" ? "default" : "outline"} onClick={() => abrir("academia")} disabled={pending}>
            Academia
          </Button>
        ) : (
          <>
            <Button type="button" size="sm" variant={modo === "paquete" ? "default" : "outline"} onClick={() => abrir("paquete")} disabled={pending}>
              A un paquete
            </Button>
            <Button type="button" size="sm" variant={modo === "particular" ? "default" : "outline"} onClick={() => abrir("particular")} disabled={pending}>
              Particular
            </Button>
          </>
        )}
      </div>

      {err && <p className="text-destructive text-sm">{err}</p>}

      {modo === "academia" && aca && (
        <div className="space-y-2">
          {aca.academias.length === 0 ? (
            <p className="text-sm">
              No hay academias activas. Crea una en <a className="underline" href="/academias">Academias</a>.
            </p>
          ) : (
            <>
              <label className="block text-xs">
                Academia
                <select value={academiaId} onChange={(e) => cambiarAcademia(e.target.value)} className={SELECT}>
                  <option value="">— Escoge una —</option>
                  {aca.academias.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                </select>
              </label>

              <label className="block text-xs">
                Profesor
                <select value={profesorId} onChange={(e) => setProfesorId(e.target.value)} className={SELECT}>
                  <option value="">El de la academia</option>
                  {aca.profesores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </label>

              {cortes.length > 0 && (
                <label className="block text-xs">
                  Este bloque dura {Math.floor(largoBloque / 60)}h{largoBloque % 60 ? ` ${largoBloque % 60}m` : ""} · ¿cómo se registra?
                  <select value={duracion} onChange={(e) => setDuracion(Number(e.target.value))} className={SELECT}>
                    <option value={0}>Todo el bloque como UNA clase</option>
                    {cortes.map((d) => (
                      <option key={d} value={d}>
                        En clases de {d} min{d === dAca ? " (como la academia)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <p className="text-muted-foreground text-xs">
                Se {franjas.length === 1 ? "creará 1 clase" : `crearán ${franjas.length} clases`}:{" "}
                {franjas.map((f) => `${f.inicio}–${f.fin}`).join(" · ")}
              </p>

              <Button type="button" size="sm" onClick={confirmar} disabled={pending || !academiaId}>
                {pending ? "Guardando…" : franjas.length === 1 ? "Confirmar clase de academia" : `Confirmar ${franjas.length} clases`}
              </Button>
            </>
          )}
        </div>
      )}

      {modo && modo !== "academia" && data && (
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
