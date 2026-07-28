import Link from "next/link";
import { StickyNote } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { esFiltro, listarNotas, NOTA_FILTROS } from "@/lib/notas";
import { staffDirectorio } from "@/lib/staff";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { NotaComposer, type OpcionEnlace } from "./nota-composer";
import { NotaCard } from "./nota-card";
import { MarcarLeidas } from "./marcar-leidas";

const VACIO: Record<string, { titulo: string; detalle: string }> = {
  mias: {
    titulo: "Nada pendiente para ti",
    detalle: "Cuando alguien te etiquete con @ o publique algo para el equipo, aparecerá aquí.",
  },
  todas: {
    titulo: "No hay notas pendientes",
    detalle: "Deja la primera: un cobro por recordar, una clase que se cancela, algo del turno.",
  },
  resueltas: {
    titulo: "Todavía no hay notas resueltas",
    detalle: "Las notas que el equipo cierre quedarán archivadas aquí.",
  },
};

/** Rango de clases que tiene sentido enganchar a una nota: la semana alrededor de hoy. */
function rangoClases() {
  const hoy = new Date();
  const desde = new Date(hoy);
  desde.setDate(hoy.getDate() - 7);
  const hasta = new Date(hoy);
  hasta.setDate(hoy.getDate() + 7);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { desde: iso(desde), hasta: iso(hasta) };
}

export default async function NotasPage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string }>;
}) {
  const profile = await requireRole(rolesForModule("notas"));
  const sp = await searchParams;
  const filtro = esFiltro(sp.filtro);
  const supabase = await createClient();
  const { desde, hasta } = rangoClases();

  const [notas, staff, clasesRes, eventosRes] = await Promise.all([
    listarNotas({ filtro, perfilId: profile.id, role: profile.role }),
    staffDirectorio(profile.id),
    supabase
      .from("clases")
      .select("id, fecha, hora_inicio, tipo, cancha")
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("fecha", { ascending: false })
      .limit(120),
    supabase
      .from("eventos")
      .select("id, nombre, fecha_inicio")
      .neq("estado", "cancelado")
      .order("fecha_inicio", { ascending: false })
      .limit(50),
  ]);

  const clases: OpcionEnlace[] = (clasesRes.data ?? []).map((c) => ({
    id: c.id,
    label: `${c.fecha}${c.hora_inicio ? ` ${c.hora_inicio.slice(0, 5)}` : ""} · ${
      c.tipo === "academia" ? "Academia" : "Particular"
    }${c.cancha ? ` · ${c.cancha}` : ""}`,
  }));
  const eventos: OpcionEnlace[] = (eventosRes.data ?? []).map((e) => ({
    id: e.id,
    label: `${e.nombre} (${e.fecha_inicio})`,
  }));

  // Al abrir "Para mí" se dan por vistas: la nota sigue pendiente, solo deja de
  // sonar la campanita. Resolver es otra cosa y se hace a mano.
  const sinLeer = notas.filter((n) => n.soyDestinatario && !n.leidaPorMi).map((n) => n.id);

  return (
    <div className="space-y-6">
      {filtro === "mias" && sinLeer.length > 0 && <MarcarLeidas notaIds={sinLeer} />}

      <h1 className="cdaf-headline">Notas</h1>

      <NotaComposer staff={staff} clases={clases} eventos={eventos} />

      <nav className="border-border flex gap-1 border-b">
        {NOTA_FILTROS.map((f) => (
          <Link
            key={f.value}
            href={`/notas?filtro=${f.value}`}
            aria-current={filtro === f.value ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm transition-colors",
              filtro === f.value
                ? "border-primary text-foreground font-semibold"
                : "text-muted-foreground hover:text-foreground border-transparent",
            )}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      {notas.length > 0 ? (
        <div className="relative isolate px-2 py-4 sm:px-4">
          {/* Hoja rayada de fondo: es lo que hace leer el conjunto como un tablón. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 rounded-2xl opacity-[0.07]"
            style={{
              backgroundImage: "linear-gradient(var(--color-charcoal) 1px, transparent 1px)",
              backgroundSize: "100% 32px",
            }}
          />
          {/* Cuadrícula, no dispersión: las urgentes siguen saliendo primero y se puede barrer con la vista. */}
          <div className="grid items-start gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {notas.map((n) => (
              <NotaCard
                key={n.id}
                nota={n}
                staff={staff}
                // Resolver lo puede hacer quien la recibió, quien la escribió o un coordinador.
                puedeResolver={n.puedeEditar}
              />
            ))}
          </div>
        </div>
      ) : (
        <EmptyState
          icon={StickyNote}
          title={VACIO[filtro].titulo}
          description={VACIO[filtro].detalle}
        />
      )}
    </div>
  );
}
