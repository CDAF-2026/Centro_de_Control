"use client";

import { useState, useTransition } from "react";
import {
  prepararAsignacion,
  materializarReserva,
  prepararAcademia,
  materializarAcademia,
  type PrepararAsignacion,
  type PrepararAcademia,
  type ClasePlaneada,
  type ProfesorConClases,
} from "./actions";
import { Button } from "@/components/ui/button";
import { aMinutos, type CalEvento } from "./types";

type Modo = "paquete" | "particular" | "academia";
const SELECT = "border-input bg-background mt-1 h-9 w-full rounded-md border px-2 text-sm";
const DIA = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

/** "15:00" + 90 → "16:30". */
function finDe(hora: string, min: number) {
  const t = (aMinutos(hora) ?? 0) + min;
  return `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

/**
 * Clases del planeador de ese profesor que caen DENTRO del bloqueo: mismo día de
 * la semana y hora dentro del rango reservado. Es lo que evita teclear horarios
 * a mano — un bloqueo de 15:00 a 18:00 con clases de 15:30 y 16:30 son dos.
 */
function clasesEnBloque(p: ProfesorConClases | null, ev: CalEvento): ClasePlaneada[] {
  if (!p) return [];
  const bi = aMinutos(ev.hora), bf = aMinutos(ev.horaFin);
  if (bi === null || bf === null) return [];
  const dow = new Date(`${ev.fecha}T00:00:00`).getDay();
  return p.clases.filter((c) => {
    if (c.dia !== dow) return false;
    const h = aMinutos(c.hora);
    return h !== null && h >= bi && h < bf;
  });
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
  // Arranca con lo que EasyCancha dice que vale la reserva, no en "0": así
  // cambiar $130.000 → $150.000 (que es lo que pasa cuando van 2 personas) es
  // corregir una cifra a la vista, y no hay forma de registrar sin querer una
  // clase en $0 — que le pagaría $0 al profesor con una regla por porcentaje.
  const [precio, setPrecio] = useState(ev.ec?.monto != null ? String(Math.trunc(ev.ec.monto)) : "0");
  const [personas, setPersonas] = useState("1");
  // Alquiler de cancha: los botones salen escondidos y esto los destapa.
  const [forzarClase, setForzarClase] = useState(false);
  /** Profesor DUEÑO del planeador que se está registrando (no el suplente). */
  const [duenoId, setDuenoId] = useState("");
  const [elegidas, setElegidas] = useState<Set<number>>(new Set());

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
      const r = await prepararAsignacion(ec.email, ec.documento);
      setData(r);
      const match = r.profesores.find((p) => p.nombre === ec.profesorMatched);
      setProfesorId(match?.id ?? "");
      setPaqueteId(r.paquetes[0] ? String(r.paquetes[0].id) : "");
    });
  }

  /** Al escoger profesor se marcan solas sus clases que caen dentro del bloqueo. */
  function cambiarDueno(id: string) {
    setDuenoId(id);
    const p = aca?.profesores.find((x) => x.id === id) ?? null;
    setElegidas(new Set(clasesEnBloque(p, ev).map((c) => c.id)));
    setProfesorId("");
  }

  const dueno = aca?.profesores.find((p) => p.id === duenoId) ?? null;
  const enBloque = clasesEnBloque(dueno, ev);
  // Ninguna de sus clases cae aquí: es una reposición o una clase extra. Se le
  // deja escoger DE CUÁL de sus clases es, para que el roster del cierre siga
  // siendo exacto — registrarla suelta dejaría una clase sin a quién esperar.
  const esReposicion = !!dueno && enBloque.length === 0;
  const candidatas = esReposicion ? dueno!.clases : enBloque;

  const clasesAEnviar = !dueno
    ? []
    : esReposicion
      ? dueno.clases
          .filter((c) => elegidas.has(c.id))
          .map((c) => ({ claseSemanalId: c.id, inicio: ev.hora, fin: ev.horaFin }))
      : enBloque
          .filter((c) => elegidas.has(c.id))
          .map((c) => ({ claseSemanalId: c.id, inicio: c.hora, fin: finDe(c.hora, c.duracionMin) }));

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

  // Opciones de corte para el caso manual (grupo sin franja a esta hora).
  const cortes = [60, 90, 120].filter((d) => d < largoBloque);

  return (
    <div className="mt-3 space-y-2 border-t pt-3">
      {/* Un alquiler no se registra ni se cierra: el título no puede pedirlo. */}
      <p className="text-sm font-medium">
        {!ec.esBloqueo && !ec.pareceClase && !forzarClase ? "Reserva de cancha" : "Registrar para poder cerrarla"}
      </p>

      {/* Alquiler de cancha: NO se ofrece convertirlo en clase.
          El 15-sep-2026 en cafetería pulsaron "Particular" sobre el alquiler de
          Iván Darío Botero y quedó de clase; salieron 5 casos iguales. Solo se
          cierran CLASES, así que un alquiler no tiene nada que hacer en la cola
          de cierre. Se esconde, no se bloquea: hay clases reales sin nota (la
          del 23-ago de Esteban venía en blanco) y bloquear dejaría al club sin
          poder registrarlas. */}
      {!ec.esBloqueo && !ec.pareceClase && !forzarClase ? (
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
        </>
      )}

      {err && <p className="text-destructive text-sm">{err}</p>}

      {modo === "academia" && aca && (
        <div className="space-y-2">
          {aca.profesores.length === 0 ? (
            <p className="text-sm">
              No hay profesores activos. Revísalos en <a className="underline" href="/empleados">Empleados</a>.
            </p>
          ) : (
            <>
              {/* Se escoge el PROFESOR, no la academia: en el planeador del club una
                  misma clase mezcla niños de recreativa y de competencia, así que la
                  academia no es del bloqueo — es de cada niño. */}
              <label className="block text-xs">
                Profesor del planeador
                <select value={duenoId} onChange={(e) => cambiarDueno(e.target.value)} className={SELECT}>
                  <option value="">— Escoge uno —</option>
                  {aca.profesores.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}{p.clases.length === 0 ? " (sin clases)" : ""}
                    </option>
                  ))}
                </select>
                {ec.comentario && (
                  <span className="text-muted-foreground mt-1 block">EasyCancha dice: “{ec.comentario}”.</span>
                )}
              </label>

              {esReposicion && (
                <p className="border-warning/35 bg-warning/10 rounded-md border px-3 py-2 text-xs text-[#6d4700]">
                  Ninguna clase de {dueno!.nombre} cae este día a esta hora. Si es una reposición o una
                  clase extra, escoge de cuál de sus clases es: así al cerrarla se sabe a quién esperar.
                </p>
              )}

              {dueno && candidatas.length > 0 && (
                <div className="space-y-1">
                  <p className="text-muted-foreground text-xs">
                    {esReposicion
                      ? `Clases de ${dueno.nombre}:`
                      : `Sus clases dentro de este bloqueo (${ev.hora}–${ev.horaFin}):`}
                  </p>
                  <ul className="space-y-1">
                    {candidatas.map((c) => (
                      <li key={c.id}>
                        <label className="flex items-start gap-2 text-xs">
                          <input
                            type="checkbox"
                            className="mt-0.5"
                            checked={elegidas.has(c.id)}
                            onChange={(e) => {
                              const s2 = new Set(elegidas);
                              if (e.target.checked) s2.add(c.id);
                              else s2.delete(c.id);
                              setElegidas(s2);
                            }}
                          />
                          <span>
                            <span className="font-medium tabular-nums">
                              {DIA[c.dia]} {c.hora}–{finDe(c.hora, c.duracionMin)}
                            </span>
                            <span className="text-muted-foreground">
                              {" · "}{c.ninos} {c.ninos === 1 ? "niño" : "niños"}
                              {c.cancha ? ` · cancha ${c.cancha}` : ""}
                            </span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {dueno && dueno.clases.length === 0 && (
                <p className="border-warning/35 bg-warning/10 rounded-md border px-3 py-2 text-xs text-[#6d4700]">
                  {dueno.nombre} no tiene ninguna clase en el planeador. Créale una en{" "}
                  <a className="underline" href={`/academias/profesor/${dueno.id}`}>Academias</a> antes de
                  registrar este bloqueo.
                </p>
              )}

              {dueno && (
                <label className="block text-xs">
                  ¿La dicta otro hoy? (opcional)
                  <select value={profesorId} onChange={(e) => setProfesorId(e.target.value)} className={SELECT}>
                    <option value="">— La dicta {dueno.nombre} —</option>
                    {aca.profesores
                      .filter((p) => p.id !== dueno.id)
                      .map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>
                  <span className="text-muted-foreground mt-1 block">
                    Se aplica a TODAS las clases de este bloqueo, y es a quien se le liquida.
                  </span>
                </label>
              )}

              {dueno && clasesAEnviar.length > 0 && (
                <p className="text-muted-foreground text-xs">
                  Se {clasesAEnviar.length === 1 ? "creará 1 clase" : `crearán ${clasesAEnviar.length} clases`}:{" "}
                  {clasesAEnviar.map((c) => `${c.inicio}–${c.fin}`).join(" · ")}.
                </p>
              )}

              <Button type="button" size="sm" onClick={confirmar} disabled={pending || clasesAEnviar.length === 0}>
                {pending ? "Guardando…" : clasesAEnviar.length === 1 ? "Confirmar clase de academia" : `Confirmar ${clasesAEnviar.length} clases`}
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
