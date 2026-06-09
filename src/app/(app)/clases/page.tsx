import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { rolesForModule, can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import { getBookings, deporteDeSport } from "@/lib/easycancha/client";
import { CalendarGrid, type CalEvento } from "./calendar-grid";

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const cop = (n: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

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

export default async function ClasesPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string; deporte?: string }>;
}) {
  const profile = await requireRole(rolesForModule("clases"));
  const sp = await searchParams;
  const now = new Date();
  const year = Number(sp.year) || now.getFullYear();
  const month = Number(sp.month) || now.getMonth() + 1;
  const deporte = sp.deporte === "tenis" || sp.deporte === "padel" ? sp.deporte : "";

  const mm = String(month).padStart(2, "0");
  const daysInMonth = new Date(year, month, 0).getDate();
  const first = `${year}-${mm}-01`;
  const last = `${year}-${mm}-${String(daysInMonth).padStart(2, "0")}`;

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
    const titulo =
      c.tipo === "academia"
        ? (c.academia_id ? acaName.get(c.academia_id) ?? "Academia" : "Academia")
        : (c.cliente_id ? cliName.get(c.cliente_id) ?? "Sin deportista" : "Sin deportista");
    return {
      id: `int-${c.id}`,
      dia: Number(c.fecha.slice(8, 10)),
      hora,
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
        ["Profesor", c.profesor_id ? profName.get(c.profesor_id) ?? "—" : "—"],
        ["Cancha", c.cancha ?? "—"],
      ],
    };
  });

  // 2) Reservas de EasyCancha
  const { bookings, error: ecError } = await getBookings({ from: first, to: last });
  const ecEventos: CalEvento[] = bookings
    .map((b) => ({ b, dep: deporteDeSport(b.sportName) }))
    .filter(({ dep }) => !deporte || dep === deporte)
    .map(({ b, dep }) => {
      const hora = (b.localStartTime ?? "").slice(0, 5);
      const fin = (b.localEndTime ?? "").slice(0, 5);
      const nombre = `${b.userFirstName ?? ""} ${b.userLastName ?? ""}`.trim() || "Reserva";
      const est = EST_EC[b.status] ?? { label: b.status, tone: "warn" as const };
      const det: [string, string][] = [["Fecha y hora", `${b.localDate} · ${hora}${fin ? `–${fin}` : ""}`]];
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
        deporte: dep,
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

  const prev = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
  const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
  const nav = (y: number, m: number) => `/clases?year=${y}&month=${m}${deporte ? `&deporte=${deporte}` : ""}`;
  const puedeCrear = can(profile.role, "clases", "edit");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="cdaf-headline">Clases · Calendario</h1>
        {puedeCrear && (
          <Link href="/clases/nueva" className={buttonVariants()}>+ Nueva clase</Link>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href={nav(prev.y, prev.m)} className={buttonVariants({ variant: "outline", size: "sm" })}>←</Link>
          <span className="cdaf-title">{MESES[month - 1]} {year}</span>
          <Link href={nav(next.y, next.m)} className={buttonVariants({ variant: "outline", size: "sm" })}>→</Link>
        </div>
        <form className="flex items-center gap-2">
          <input type="hidden" name="year" value={year} />
          <input type="hidden" name="month" value={month} />
          <select name="deporte" defaultValue={deporte} className="border-input bg-background h-9 rounded-md border px-3 text-sm">
            <option value="">Todos</option>
            <option value="tenis">Tenis</option>
            <option value="padel">Pádel</option>
          </select>
          <button type="submit" className={buttonVariants({ variant: "outline", size: "sm" })}>Filtrar</button>
        </form>
      </div>

      {ecError && (
        <p className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm">
          No se pudieron cargar las reservas de EasyCancha: {ecError}
        </p>
      )}

      <CalendarGrid year={year} month={month} eventos={eventos} />

      <div className="text-muted-foreground flex flex-wrap gap-4 text-xs">
        <span><span className="bg-chart-3/40 mr-1 inline-block size-3 rounded align-middle" /> Tenis</span>
        <span><span className="bg-lime/60 mr-1 inline-block size-3 rounded align-middle" /> Pádel</span>
        <span><span className="border-foreground/40 mr-1 inline-block size-3 rounded border-l-2 align-middle" /> Reserva EasyCancha</span>
        <span className="line-through opacity-60">Cancelada</span>
        <span>· Haz clic en el día o en “+N más” para ver todo.</span>
      </div>
    </div>
  );
}
