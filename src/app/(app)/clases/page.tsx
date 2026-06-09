import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { rolesForModule, can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import { getBookings, deporteDeSport, profesorDeCancha } from "@/lib/easycancha/client";
import { CalendarGrid } from "./calendar-grid";
import { DayView } from "./day-view";
import { ProfesorPicker } from "./profesor-picker";
import type { CalEvento } from "./types";

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const cop = (n: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

const pad = (n: number) => String(n).padStart(2, "0");
const shiftDay = (iso: string, delta: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + delta);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
};

const EST_INTERNA: Record<string, { label: string; tone: "ok" | "warn" | "bad" }> = {
  realizada: { label: "Realizada", tone: "ok" },
  programada: { label: "Programada", tone: "warn" },
  cancelada: { label: "Cancelada", tone: "bad" },
  no_show: { label: "No-show", tone: "bad" },
};
const EST_EC: Record<string, { label: string; tone: "ok" | "warn" | "bad" }> = {
  PAID: { label: "Pagada", tone: "ok" },
  USED: { label: "Usada", tone: "ok" },
  BOOKED: { label: "Reservada", tone: "warn" },
  PARTIALLY_PAID: { label: "Abono parcial", tone: "warn" },
  CANCELLED: { label: "Cancelada", tone: "bad" },
  EXCHANGED: { label: "Reprogramada", tone: "bad" },
};

type Vista = "mes" | "dia" | "profesor";

export default async function ClasesPage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string; year?: string; month?: string; date?: string; deporte?: string; profesor?: string }>;
}) {
  const profile = await requireRole(rolesForModule("clases"));
  const sp = await searchParams;
  const now = new Date();
  const todayIso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  const vista: Vista = sp.vista === "dia" ? "dia" : sp.vista === "profesor" ? "profesor" : "mes";
  const deporte = sp.deporte === "tenis" || sp.deporte === "padel" ? sp.deporte : "";
  const dep = deporte ? `&deporte=${deporte}` : "";
  const selProf = (sp.profesor ?? "").trim();

  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : todayIso;
  const [dy, dm, dd] = date.split("-").map(Number);
  const year = vista === "dia" ? dy : Number(sp.year) || now.getFullYear();
  const month = vista === "dia" ? dm : Number(sp.month) || now.getMonth() + 1;

  // Rango a consultar (día solo en vista Día; mes en Mes y Profesor)
  let first: string, last: string;
  if (vista === "dia") {
    first = last = date;
  } else {
    const mm = pad(month);
    const dim = new Date(year, month, 0).getDate();
    first = `${year}-${mm}-01`;
    last = `${year}-${mm}-${pad(dim)}`;
  }

  // 1) Clases internas (CDAF)
  const supabase = await createClient();
  let q = supabase
    .from("clases")
    .select("id, fecha, hora_inicio, hora_fin, deporte, tipo, estado, cancha, profesor_id, cliente_id, academia_id")
    .gte("fecha", first)
    .lte("fecha", last)
    .order("hora_inicio");
  if (deporte) q = q.eq("deporte", deporte);
  const { data: clases } = await q;
  const lista = clases ?? [];

  const profIds = [...new Set(lista.map((c) => c.profesor_id).filter((x): x is string => !!x))];
  const cliIds = [...new Set(lista.filter((c) => c.tipo === "individual").map((c) => c.cliente_id).filter((x): x is number => x != null))];
  const acaIds = [...new Set(lista.map((c) => c.academia_id).filter((x): x is number => x != null))];

  const profName = new Map<string, string>();
  if (profIds.length) {
    const { data } = await supabase.from("profiles").select("id, nombre").in("id", profIds);
    for (const p of data ?? []) profName.set(p.id, p.nombre ?? "—");
  }
  const cliName = new Map<number, string>();
  if (cliIds.length) {
    const { data } = await supabase.from("clientes").select("id, nombres, apellidos").in("id", cliIds);
    for (const c of data ?? []) cliName.set(c.id, `${c.nombres} ${c.apellidos}`);
  }
  const acaName = new Map<number, string>();
  if (acaIds.length) {
    const { data } = await supabase.from("academias").select("id, nombre").in("id", acaIds);
    for (const a of data ?? []) acaName.set(a.id, a.nombre);
  }

  const internas: CalEvento[] = lista.map((c) => {
    const hora = c.hora_inicio?.slice(0, 5) ?? "";
    const horaFin = c.hora_fin?.slice(0, 5) ?? "";
    const est = EST_INTERNA[c.estado] ?? { label: c.estado, tone: "warn" as const };
    const profesor = c.profesor_id ? profName.get(c.profesor_id) ?? null : null;
    const titulo =
      c.tipo === "academia"
        ? (c.academia_id ? acaName.get(c.academia_id) ?? "Academia" : "Academia")
        : (c.cliente_id ? cliName.get(c.cliente_id) ?? "Sin deportista" : "Sin deportista");
    return {
      id: `int-${c.id}`,
      dia: Number(c.fecha.slice(8, 10)),
      hora,
      horaFin,
      cancha: c.cancha ?? null,
      profesor,
      deporte: c.deporte,
      fuente: "interna",
      cancelada: c.estado === "cancelada" || c.estado === "no_show",
      chip: `${hora} ${c.tipo === "academia" ? "Acad." : "Ind."}`,
      titulo,
      subtitulo: `${c.tipo === "academia" ? "Clase de academia" : "Clase individual"}${c.deporte ? ` · ${c.deporte}` : ""} · CDAF`,
      estadoLabel: est.label,
      estadoTone: est.tone,
      detalles: [
        ["Fecha y hora", `${c.fecha} · ${hora}${horaFin ? `–${horaFin}` : ""}`],
        ["Profesor", profesor ?? "—"],
        ["Cancha", c.cancha ?? "—"],
      ],
    };
  });

  // 2) Reservas de EasyCancha
  const { bookings, error: ecError } = await getBookings({ from: first, to: last });
  const ecEventos: CalEvento[] = bookings
    .map((b) => ({ b, depB: deporteDeSport(b.sportName) }))
    .filter(({ depB }) => !deporte || depB === deporte)
    .map(({ b, depB }) => {
      const hora = (b.localStartTime ?? "").slice(0, 5);
      const fin = (b.localEndTime ?? "").slice(0, 5);
      const nombre = `${b.userFirstName ?? ""} ${b.userLastName ?? ""}`.trim() || "Reserva";
      const profesor = profesorDeCancha(b.courtName);
      const est = EST_EC[b.status] ?? { label: b.status, tone: "warn" as const };
      const det: [string, string][] = [["Fecha y hora", `${b.localDate} · ${hora}${fin ? `–${fin}` : ""}`]];
      if (profesor) det.push(["Profesor", profesor]);
      if (b.courtName) det.push(["Cancha", b.courtName]);
      if (b.userPhone) det.push(["Teléfono", b.userPhone]);
      if (b.userEmail) det.push(["Correo", b.userEmail]);
      if (b.totalAmount != null)
        det.push(["Monto", `${cop(b.totalAmount)}${b.totalAmountPaid ? ` · pagado ${cop(b.totalAmountPaid)}` : ""}`]);
      if (b.customerCodes) det.push(["Código", b.customerCodes]);
      return {
        id: `ec-${b.id}`,
        dia: Number(b.localDate.slice(8, 10)),
        hora,
        horaFin: fin,
        cancha: b.courtName ?? null,
        profesor,
        deporte: depB,
        fuente: "easycancha" as const,
        cancelada: b.status === "CANCELLED" || b.status === "EXCHANGED",
        chip: `${hora} ${b.userLastName || b.userFirstName || b.sportName || "Reserva"}`,
        titulo: nombre,
        subtitulo: `${b.sportName ?? "Reserva"} · EasyCancha`,
        estadoLabel: est.label,
        estadoTone: est.tone,
        detalles: det,
      };
    });

  const eventos = [...internas, ...ecEventos];

  // Vista Profesor: lista de profesores + filtrado
  let professors: string[] = [];
  if (vista === "profesor") {
    const { data: pf } = await supabase.from("profiles").select("nombre").eq("role", "profesor");
    const internos = (pf ?? []).map((p) => p.nombre).filter((x): x is string => !!x);
    const deEC = eventos.filter((e) => e.fuente === "easycancha" && e.profesor).map((e) => e.profesor as string);
    professors = [...new Set([...internos, ...deEC])].sort((a, b) => a.localeCompare(b, "es"));
  }
  const eventosVista = vista === "profesor" ? (selProf ? eventos.filter((e) => e.profesor === selProf) : []) : eventos;

  // Navegación + cambio de vista
  const navMes = (y: number, m: number) => `/clases?vista=mes&year=${y}&month=${m}${dep}`;
  const navDia = (d: string) => `/clases?vista=dia&date=${d}${dep}`;
  const profQ = selProf ? `&profesor=${encodeURIComponent(selProf)}` : "";
  const navProf = (y: number, m: number) => `/clases?vista=profesor&year=${y}&month=${m}${profQ}${dep}`;
  const navMonth = vista === "profesor" ? navProf : navMes;
  const diaDate = vista === "dia" ? date : todayIso;
  const prevM = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
  const nextM = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };

  const fmtDiaRaw = new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(dy, dm - 1, dd));
  const fmtDia = fmtDiaRaw.charAt(0).toUpperCase() + fmtDiaRaw.slice(1);

  const puedeCrear = can(profile.role, "clases", "edit");
  const tabCls = (activa: boolean) => buttonVariants({ variant: activa ? "default" : "outline", size: "sm" });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="cdaf-headline">Clases · Calendario</h1>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <Link href={navMes(year, month)} className={tabCls(vista === "mes")}>Mes</Link>
            <Link href={navDia(diaDate)} className={tabCls(vista === "dia")}>Día</Link>
            <Link href={navProf(year, month)} className={tabCls(vista === "profesor")}>Profesor</Link>
          </div>
          {puedeCrear && (
            <Link href="/clases/nueva" className={buttonVariants()}>+ Nueva clase</Link>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {vista === "dia" ? (
            <>
              <Link href={navDia(shiftDay(date, -1))} className={buttonVariants({ variant: "outline", size: "sm" })}>←</Link>
              <span className="cdaf-title">{fmtDia}</span>
              <Link href={navDia(shiftDay(date, 1))} className={buttonVariants({ variant: "outline", size: "sm" })}>→</Link>
              {date !== todayIso && (
                <Link href={navDia(todayIso)} className={buttonVariants({ variant: "outline", size: "sm" })}>Hoy</Link>
              )}
            </>
          ) : (
            <>
              <Link href={navMonth(prevM.y, prevM.m)} className={buttonVariants({ variant: "outline", size: "sm" })}>←</Link>
              <span className="cdaf-title">{MESES[month - 1]} {year}</span>
              <Link href={navMonth(nextM.y, nextM.m)} className={buttonVariants({ variant: "outline", size: "sm" })}>→</Link>
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {vista === "profesor" && (
            <ProfesorPicker professors={professors} selected={selProf} year={year} month={month} deporte={deporte} />
          )}
          <form className="flex items-center gap-2">
            <input type="hidden" name="vista" value={vista} />
            {vista === "dia" ? (
              <input type="hidden" name="date" value={date} />
            ) : (
              <>
                <input type="hidden" name="year" value={year} />
                <input type="hidden" name="month" value={month} />
                {vista === "profesor" && <input type="hidden" name="profesor" value={selProf} />}
              </>
            )}
            <select name="deporte" defaultValue={deporte} className="border-input bg-background h-9 rounded-md border px-3 text-sm">
              <option value="">Todos</option>
              <option value="tenis">Tenis</option>
              <option value="padel">Pádel</option>
            </select>
            <button type="submit" className={buttonVariants({ variant: "outline", size: "sm" })}>Filtrar</button>
          </form>
        </div>
      </div>

      {ecError && (
        <p className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm">
          No se pudieron cargar las reservas de EasyCancha: {ecError}
        </p>
      )}

      {vista === "dia" ? (
        <DayView eventos={eventosVista} esHoy={date === todayIso} />
      ) : vista === "profesor" && !selProf ? (
        <p className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
          Elige un profesor para ver su calendario.
        </p>
      ) : (
        <CalendarGrid year={year} month={month} deporte={deporte} eventos={eventosVista} />
      )}

      <div className="text-muted-foreground flex flex-wrap gap-4 text-xs">
        <span><span className="bg-chart-3/40 mr-1 inline-block size-3 rounded align-middle" /> Tenis</span>
        <span><span className="bg-lime/60 mr-1 inline-block size-3 rounded align-middle" /> Pádel</span>
        <span><span className="border-foreground/40 mr-1 inline-block size-3 rounded border-l-2 align-middle" /> Reserva EasyCancha</span>
        <span className="line-through opacity-60">Cancelada</span>
        {vista === "profesor" && selProf && <span>· Mostrando solo: <strong>{selProf}</strong></span>}
      </div>
    </div>
  );
}
