"use client";

import { useState, useTransition } from "react";
import {
  prepararAsignacion,
  materializarReserva,
  prepararAcademia,
  materializarAcademia,
  type PrepararAsignacion,
  type PrepararAcademia,
  type GrupoOpcion,
} from "./actions";
import { Button } from "@/components/ui/button";
import { aMinutos, franjasDeBloque, type CalEvento } from "./types";

type Modo = "paquete" | "particular" | "academia";
const SELECT = "border-input bg-background mt-1 h-9 w-full rounded-md border px-2 text-sm";
const DIA = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

/**
 * Franjas del grupo que caen DENTRO del bloqueo: mismo día de la semana y hora
 * dentro del rango reservado. Es lo que evita teclear horarios a mano — un
 * bloqueo de 15:00 a 18:00 donde el grupo tiene 15:30 y 16:30 son dos clases.
 */
function franjasDelGrupoEnBloque(g: GrupoOpcion | null, ev: CalEvento) {
  if (!g) return [];
  const bi = aMinutos(ev.hora), bf = aMinutos(ev.horaFin);
  if (bi === null || bf === null) return [];
  const dow = new Date(`${ev.fecha}T00:00:00`).getDay();
  return g.franjas.filter((f) => {
    if (f.dia !== dow) return false;
    const h = aMinutos(f.hora);
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
  const [precio, setPrecio] = useState("0");
  const [academiaId, setAcademiaId] = useState("");
  const [grupoId, setGrupoId] = useState("");
  const [franjasElegidas, setFranjasElegidas] = useState<Set<number>>(new Set());
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

  /** Cambiar de academia limpia el grupo: los grupos son de una academia. */
  function cambiarAcademia(id: string) {
    setAcademiaId(id);
    setGrupoId("");
    setFranjasElegidas(new Set());
  }

  /** Al escoger grupo se marcan solas sus franjas que caen dentro del bloqueo. */
  function cambiarGrupo(id: string) {
    setGrupoId(id);
    const g = aca?.grupos.find((x) => String(x.id) === id) ?? null;
    const dentro = franjasDelGrupoEnBloque(g, ev);
    setFranjasElegidas(new Set(dentro.map((f) => f.id)));
    // Se sugiere el profesor SOLO si todas las franjas coinciden en uno: con dos
    // profes distintos dentro del bloque, cualquier sugerencia sería mentira
    // para una de las dos clases. Ahí se deja vacío y cada clase toma el suyo.
    const profes = new Set(dentro.map((f) => f.profesorId ?? ""));
    if (!profesorId && profes.size === 1 && dentro[0]?.profesorId) setProfesorId(dentro[0].profesorId);
    setDuracion(0);
  }

  const grupo = aca?.grupos.find((g) => String(g.id) === grupoId) ?? null;
  const gruposDeAcademia = (aca?.grupos ?? []).filter((g) => String(g.academiaId) === academiaId);
  const enBloque = franjasDelGrupoEnBloque(grupo, ev);
  const franjas = franjasDeBloque(ev.hora, ev.horaFin, duracion);

  // Con franjas del grupo dentro del bloqueo se usan esas (cada una es una clase
  // con su hora real). Si el grupo no tiene ninguna a esa hora —una clase extra,
  // una reposición— se cae al corte manual del bloque.
  const clasesAEnviar = !grupo
    ? []
    : enBloque.length > 0
      ? enBloque
          .filter((f) => franjasElegidas.has(f.id))
          .map((f) => ({ grupoId: grupo.id, inicio: f.hora, fin: f.horaFin, profesorId: f.profesorId }))
      : franjas.map((f) => ({ grupoId: grupo.id, inicio: f.inicio, fin: f.fin, profesorId: null }));

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

  // Opciones de corte para el caso manual (grupo sin franja a esta hora).
  const cortes = [60, 90, 120].filter((d) => d < largoBloque);

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

              {academiaId && (
                <label className="block text-xs">
                  Grupo
                  <select value={grupoId} onChange={(e) => cambiarGrupo(e.target.value)} className={SELECT}>
                    <option value="">— Escoge uno —</option>
                    {gruposDeAcademia.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.nombre} · {g.nivel} · {g.edadMin}–{g.edadMax} años
                      </option>
                    ))}
                  </select>
                  {gruposDeAcademia.length === 0 && (
                    <span className="text-muted-foreground mt-1 block">
                      Esta academia todavía no tiene grupos.
                    </span>
                  )}
                </label>
              )}

              {grupo && (
                <label className="block text-xs">
                  Profesor
                  <select value={profesorId} onChange={(e) => setProfesorId(e.target.value)} className={SELECT}>
                    <option value="">
                      {enBloque.some((f) => f.profesorId) ? "— El de cada franja —" : "— Sin asignar —"}
                    </option>
                    {aca.profesores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>
                  <span className="text-muted-foreground mt-1 block">
                    Escoger uno lo aplica a TODAS las clases de este bloqueo (útil si hoy hay
                    suplente).
                    {ec.comentario && <> EasyCancha dice: “{ec.comentario}”.</>}
                  </span>
                </label>
              )}

              {/* Franjas del grupo que caen dentro del bloqueo: una clase por franja,
                  con su hora real. Sin teclear horarios. */}
              {grupo && enBloque.length > 0 && (
                <div className="space-y-1">
                  <p className="text-muted-foreground text-xs">
                    Clases de {grupo.nombre} dentro de este bloqueo ({ev.hora}–{ev.horaFin}):
                  </p>
                  <ul className="space-y-1">
                    {enBloque.map((f) => (
                      <li key={f.id}>
                        <label className="flex items-start gap-2 text-xs">
                          <input
                            type="checkbox"
                            className="mt-0.5"
                            checked={franjasElegidas.has(f.id)}
                            onChange={(e) => {
                              const s2 = new Set(franjasElegidas);
                              if (e.target.checked) s2.add(f.id);
                              else s2.delete(f.id);
                              setFranjasElegidas(s2);
                            }}
                          />
                          <span>
                            <span className="font-medium tabular-nums">{DIA[f.dia]} {f.hora}–{f.horaFin}</span>
                            <span className="text-muted-foreground">
                              {" · "}
                              {aca.profesores.find((p) => p.id === (profesorId || f.profesorId))?.nombre ?? "sin profesor"}
                              {f.cancha ? ` · cancha ${f.cancha}` : ""}
                            </span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Sin franjas a esa hora: el grupo no tiene clase ahí. Se registra
                  igual (clase extra o reposición), partiendo el bloque a mano. */}
              {grupo && enBloque.length === 0 && (
                <>
                  <p className="border-warning/35 bg-warning/10 rounded-md border px-3 py-2 text-xs text-[#6d4700]">
                    {grupo.nombre} no tiene ninguna franja este día a esta hora. Se puede registrar igual
                    —como clase extra o reposición— escogiendo cómo se parte el bloque.
                  </p>
                  {cortes.length > 0 && (
                    <label className="block text-xs">
                      Este bloque dura {Math.floor(largoBloque / 60)}h{largoBloque % 60 ? ` ${largoBloque % 60}m` : ""} · ¿cómo se registra?
                      <select value={duracion} onChange={(e) => setDuracion(Number(e.target.value))} className={SELECT}>
                        <option value={0}>Todo el bloque como UNA clase</option>
                        {cortes.map((d) => <option key={d} value={d}>En clases de {d} min</option>)}
                      </select>
                    </label>
                  )}
                </>
              )}

              {grupo && (
                <p className="text-muted-foreground text-xs">
                  Se {clasesAEnviar.length === 1 ? "creará 1 clase" : `crearán ${clasesAEnviar.length} clases`}
                  {clasesAEnviar.length > 0 && `: ${clasesAEnviar.map((c) => `${c.inicio}–${c.fin}`).join(" · ")}`}.
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
