import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { rolesForModule, can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const DOW = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

type ClaseCell = {
  id: number;
  fecha: string;
  deporte: "tenis" | "padel" | null;
  tipo: "academia" | "individual";
  hora_inicio: string | null;
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
  const month = Number(sp.month) || now.getMonth() + 1; // 1–12
  const deporte = sp.deporte === "tenis" || sp.deporte === "padel" ? sp.deporte : "";

  const mm = String(month).padStart(2, "0");
  const daysInMonth = new Date(year, month, 0).getDate();
  const first = `${year}-${mm}-01`;
  const last = `${year}-${mm}-${String(daysInMonth).padStart(2, "0")}`;

  const supabase = await createClient();
  let q = supabase
    .from("clases")
    .select("id, fecha, deporte, tipo, hora_inicio")
    .gte("fecha", first)
    .lte("fecha", last)
    .order("hora_inicio");
  if (deporte) q = q.eq("deporte", deporte);
  const { data: clases } = await q;

  const byDay = new Map<number, ClaseCell[]>();
  for (const c of (clases ?? []) as ClaseCell[]) {
    const day = Number(c.fecha.slice(8, 10));
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(c);
  }

  const firstWeekday = new Date(year, month - 1, 1).getDay(); // 0=Dom
  const offset = (firstWeekday + 6) % 7; // lunes primero
  const cells: (number | null)[] = [
    ...Array(offset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const prev = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
  const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
  const nav = (y: number, m: number) =>
    `/clases?year=${y}&month=${m}${deporte ? `&deporte=${deporte}` : ""}`;

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

      <div className="bg-border grid grid-cols-7 gap-px overflow-hidden rounded-lg border">
        {DOW.map((d) => (
          <div key={d} className="bg-muted px-2 py-1 text-center text-xs font-semibold">{d}</div>
        ))}
        {cells.map((day, i) => (
          <div key={i} className="bg-card min-h-24 p-1">
            {day && (
              <>
                <div className="text-muted-foreground text-xs">{day}</div>
                <div className="space-y-0.5">
                  {(byDay.get(day) ?? []).slice(0, 4).map((c) => (
                    <div
                      key={c.id}
                      className={`truncate rounded px-1 text-xs ${
                        c.deporte === "tenis" ? "bg-chart-3/20" : "bg-lime/30"
                      }`}
                      title={`${c.tipo} · ${c.deporte ?? ""}`}
                    >
                      {c.hora_inicio?.slice(0, 5) ?? ""} {c.tipo === "academia" ? "Acad." : "Ind."}
                    </div>
                  ))}
                  {(byDay.get(day)?.length ?? 0) > 4 && (
                    <div className="text-muted-foreground text-xs">+{byDay.get(day)!.length - 4} más</div>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="text-muted-foreground flex gap-4 text-xs">
        <span><span className="bg-chart-3/40 mr-1 inline-block size-3 rounded align-middle" /> Tenis</span>
        <span><span className="bg-lime/60 mr-1 inline-block size-3 rounded align-middle" /> Pádel</span>
      </div>
    </div>
  );
}
