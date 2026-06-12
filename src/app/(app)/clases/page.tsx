import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { rolesForModule, can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import { getBookings, deporteDeSport, profesorDeCancha } from "@/lib/easycancha/client";
import { CalendarGrid } from "./calendar-grid";
import { DayView } from "./day-view";
import { ProfesorPicker } from "./profesor-picker";
import { CourtPicker } from "./court-picker";
import { courtInfo, type CalEvento } from "./types";

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

type Vista = "mes" | "dia" | "profesor" | "cancha";

export default async function ClasesPage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string; year?: string; month?: string; date?: string; deporte?: string; profesor?: string; cancha?: string }>;
}) {
  const profile = await requireRole(rolesForModule("clases"));
  const sp = await searchParams;
  const now = new Date();
  const todayIso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  const vista: Vista =
    sp.vista === "dia" ? "dia" : sp.vista === "profesor" ? "profesor" : sp.vista === "cancha" ? "cancha" : "mes";
  const deporte = sp.deporte === "tenis" || sp.deporte === "padel" ? sp.deporte : "";
  const dep = deporte ? `&deporte=${deporte}` : "";
  const selProf = (sp.profesor ?? "").trim();
  const selCancha = (sp.cancha ?? "").trim();

  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : todayIso;
  const [dy, dm, dd] = date.split("-").map(Number);
  // Día/Profesor/Cancha giran en torno a una fecha; Mes usa year/month sueltos.
  const year = vista === "mes" ? Number(sp.year) || now.getFullYear() : dy;
  const month = vista === "mes" ? Number(sp.month) || now.getMonth() + 1 : dm;

  // Rango: Día = un día; Mes/Profesor/Cancha = el mes (los selectores listan todo el mes).
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
    .select("id, fecha, hora_inicio, hora_fin, deporte, tipo, estado, cancha, profesor_id, cliente_id, academia_id, easycancha_booking_id")
    .gte("fecha", first)
    .lte("fecha", last)
    .order("hora_inicio");
  if (deporte) q = q.eq("deporte", deporte);
  const { data: clases } = await q;
  const lista = clases ?? [];
  // Reservas EC ya materializadas en clases → no duplicarlas en el calendario.
  const materializedIds = new Set(lista.map((c) => c.easycancha_booking_id).filter((x): x is string => !!x));

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
      fecha: c.fecha,
      hora,
      horaFin,
      cancha: c.cancha ?? null,
      courtKey: courtInfo(c.cancha, c.deporte).key,
      courtLabel: courtInfo(c.cancha, c.deporte).label,
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
    .filter(({ b, depB }) => (!deporte || depB === deporte) && !materializedIds.has(b.id))
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
        fecha: b.localDate,
        hora,
        horaFin: fin,
        cancha: b.courtName ?? null,
        courtKey: courtInfo(b.courtName, depB).key,
        courtLabel: courtInfo(b.courtName, depB).label,
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
        ec: {
          bookingId: b.id,
          email: b.userEmail ?? "",
          nombres: b.userFirstName ?? "",
          apellidos: b.userLastName ?? "",
          telefono: b.userPhone ?? "",
          profesorMatched: profesor,
        },
      };
    });

  const eventos = [...internas, ...ecEventos];

  // Vista Profesor: profesores con clases en el mes
  let professors: string[] = [];
  if (vista === "profesor") {
    professors = [...new Set(eventos.filter((e) => e.profesor).map((e) => e.profesor as string))]
      .sort((a, b) => a.localeCompare(b, "es"));
  }

  // Vista Cancha: canchas FÍSICAS del mes (Cancha N), separadas por deporte.
  type Court = { key: string; label: string };
  let courtsTenis: Court[] = [], courtsPadel: Court[] = [], courtsOtras: Court[] = [];
  if (vista === "cancha") {
    const seen = new Map<string, { label: string; dep: "tenis" | "padel" | null }>();
    for (const e of eventos) {
      if (!e.courtKey || seen.has(e.courtKey)) continue;
      seen.set(e.courtKey, { label: e.courtLabel, dep: e.deporte });
    }
    const byLabel = (a: Court, b: Court) => a.label.localeCompare(b.label, "es", { numeric: true });
    for (const [key, v] of seen) {
      const court = { key, label: v.label };
      if (v.dep === "tenis") courtsTenis.push(court);
      else if (v.dep === "padel") courtsPadel.push(court);
      else courtsOtras.push(court);
    }
    courtsTenis.sort(byLabel);
    courtsPadel.sort(byLabel);
    courtsOtras.sort(byLabel);
  }

  const eventosVista =
    vista === "mes" || vista === "dia"
      ? eventos
      : vista === "profesor"
        ? (selProf ? eventos.filter((e) => e.dia === dd && e.profesor === selProf) : [])
        : (selCancha ? eventos.filter((e) => e.dia === dd && e.courtKey === selCancha) : []);

  const selCanchaLabel = selCancha
    ? `${eventos.find((e) => e.courtKey === selCancha)?.courtLabel ?? "Cancha"}${selCancha.startsWith("padel") ? " · pádel" : selCancha.startsWith("tenis") ? " · tenis" : ""}`
    : "";

  // Navegación + cambio de vista
  const navMes = (y: number, m: number) => `/clases?vista=mes&year=${y}&month=${m}${dep}`;
  const navDia = (d: string) => `/clases?vista=dia&date=${d}${dep}`;
  const profQ = selProf ? `&profesor=${encodeURIComponent(selProf)}` : "";
  const canchaQ = selCancha ? `&cancha=${encodeURIComponent(selCancha)}` : "";
  const navProf = (d: string) => `/clases?vista=profesor&date=${d}${profQ}${dep}`;
  const navCancha = (d: string) => `/clases?vista=cancha&date=${d}${canchaQ}${dep}`;
  const navDay = vista === "profesor" ? navProf : vista === "cancha" ? navCancha : navDia;
  const diaDate = vista === "mes" ? todayIso : date;
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
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <Link href={navMes(year, month)} className={tabCls(vista === "mes")}>Mes</Link>
            <Link href={navDia(diaDate)} className={tabCls(vista === "dia")}>Día</Link>
            <Link href={navProf(diaDate)} className={tabCls(vista === "profesor")}>Profesor</Link>
            <Link href={navCancha(diaDate)} className={tabCls(vista === "cancha")}>Cancha</Link>
          </div>
          {puedeCrear && (
            <Link href="/clases/nueva" className={buttonVariants()}>+ Nueva clase</Link>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {vista === "mes" ? (
            <>
              <Link href={navMes(prevM.y, prevM.m)} className={buttonVariants({ variant: "outline", size: "sm" })}>←</Link>
              <span className="cdaf-title">{MESES[month - 1]} {year}</span>
              <Link href={navMes(nextM.y, nextM.m)} className={buttonVariants({ variant: "outline", size: "sm" })}>→</Link>
            </>
          ) : (
            <>
              <Link href={navDay(shiftDay(date, -1))} className={buttonVariants({ variant: "outline", size: "sm" })}>←</Link>
              <span className="cdaf-title">{fmtDia}</span>
              <Link href={navDay(shiftDay(date, 1))} className={buttonVariants({ variant: "outline", size: "sm" })}>→</Link>
              {date !== todayIso && (
                <Link href={navDay(todayIso)} className={buttonVariants({ variant: "outline", size: "sm" })}>Hoy</Link>
              )}
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {vista === "profesor" && (
            <ProfesorPicker professors={professors} selected={selProf} date={date} deporte={deporte} />
          )}
          {vista === "cancha" && (
            <CourtPicker tenis={courtsTenis} padel={courtsPadel} otras={courtsOtras} selected={selCancha} date={date} deporte={deporte} />
          )}
          <form className="flex items-center gap-2">
            <input type="hidden" name="vista" value={vista} />
            {vista === "mes" ? (
              <>
                <input type="hidden" name="year" value={year} />
                <input type="hidden" name="month" value={month} />
              </>
            ) : (
              <input type="hidden" name="date" value={date} />
            )}
            {vista === "profesor" && <input type="hidden" name="profesor" value={selProf} />}
            {vista === "cancha" && <input type="hidden" name="cancha" value={selCancha} />}
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

      {vista === "mes" ? (
        <CalendarGrid year={year} month={month} deporte={deporte} eventos={eventosVista} canAssign={puedeCrear} />
      ) : vista === "profesor" && !selProf ? (
        <p className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
          Elige un profesor para ver su día.
        </p>
      ) : vista === "cancha" && !selCancha ? (
        <p className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
          Elige una cancha para ver su día.
        </p>
      ) : (
        <DayView eventos={eventosVista} esHoy={date === todayIso} canAssign={puedeCrear} />
      )}

      <div className="text-muted-foreground flex flex-wrap gap-4 text-xs">
        <span><span className="bg-chart-3/40 mr-1 inline-block size-3 rounded align-middle" /> Tenis</span>
        <span><span className="bg-lime/60 mr-1 inline-block size-3 rounded align-middle" /> Pádel</span>
        <span><span className="border-foreground/40 mr-1 inline-block size-3 rounded border-l-2 align-middle" /> Reserva EasyCancha</span>
        <span className="line-through opacity-60">Cancelada</span>
        {vista === "mes" && <span>· Haz clic en el número del día para abrir la vista por día.</span>}
        {vista === "profesor" && selProf && <span>· Día de: <strong>{selProf}</strong></span>}
        {vista === "cancha" && selCancha && <span>· Cancha: <strong>{selCanchaLabel}</strong></span>}
      </div>
    </div>
  );
}
