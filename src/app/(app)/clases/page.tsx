import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { rolesForModule, can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import { CalendarGrid, type ClaseCal } from "./calendar-grid";

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

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

  // Nombres de profesor / deportista / academia
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

  const clasesCal: ClaseCal[] = lista.map((c) => ({
    id: c.id,
    dia: Number(c.fecha.slice(8, 10)),
    fecha: c.fecha,
    hora: c.hora_inicio?.slice(0, 5) ?? "",
    horaFin: c.hora_fin?.slice(0, 5) ?? "",
    tipo: c.tipo,
    deporte: c.deporte,
    estado: c.estado,
    cancha: c.cancha,
    titulo:
      c.tipo === "academia"
        ? c.academia_id
          ? acaName.get(c.academia_id) ?? "Academia"
          : "Academia"
        : c.cliente_id
          ? cliName.get(c.cliente_id) ?? "Sin deportista"
          : "Sin deportista",
    profesor: c.profesor_id ? profName.get(c.profesor_id) ?? "—" : "—",
  }));

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

      <CalendarGrid year={year} month={month} clases={clasesCal} />

      <div className="text-muted-foreground flex gap-4 text-xs">
        <span><span className="bg-chart-3/40 mr-1 inline-block size-3 rounded align-middle" /> Tenis</span>
        <span><span className="bg-lime/60 mr-1 inline-block size-3 rounded align-middle" /> Pádel</span>
      </div>
    </div>
  );
}
