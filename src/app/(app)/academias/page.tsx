import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { rolesForModule, can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { docentesConDeporte, opcionesParaDeporte } from "@/lib/staff";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DIA_CORTO, DIAS_SEMANA, hhmm } from "./ui";

/**
 * El planeador de la semana.
 *
 * Es la pantalla que reemplaza el Excel del club: una fila por profesor, los
 * días como columnas, y en cada celda sus clases con cuántos niños vienen. De
 * un vistazo contesta lo que ellos consultaban abriendo cinco pestañas —
 * cuántas academias tiene cada profesor y a qué horas.
 */
export default async function AcademiasPage({
  searchParams,
}: {
  searchParams: Promise<{ aviso?: string }>;
}) {
  const profile = await requireRole(rolesForModule("academias"));
  const { aviso } = await searchParams;
  const supabase = await createClient();

  const [{ data: clases }, { data: academias }, docentes] = await Promise.all([
    supabase.rpc("planeador_semana", { p_deporte: "tenis" }),
    supabase.from("academias").select("id, codigo, nombre, deporte, categoria, activa").order("deporte", { ascending: false }).order("categoria"),
    docentesConDeporte(),
  ]);

  const cs = clases ?? [];
  // Se listan TODOS los docentes de tenis, no solo los que hoy tienen clases:
  // un profesor nuevo tiene que poder aparecer para poder asignarle la primera.
  const profesores = opcionesParaDeporte(docentes, "tenis");

  const porProfesor = new Map<string, typeof cs>();
  for (const c of cs) {
    const lista = porProfesor.get(c.profesor_id) ?? [];
    lista.push(c);
    porProfesor.set(c.profesor_id, lista);
  }

  const totalNinos = cs.reduce((n, c) => n + c.ninos, 0);
  const horasCancha = cs.reduce((n, c) => n + c.duracion_min, 0) / 60;
  const puedeEditar = can(profile.role, "academias", "edit");

  // Un profesor sin clases se muestra igual, al final: es el hueco que hay que
  // llenar, no algo que esconder.
  const filas = profesores
    .map((p) => ({ ...p, clases: porProfesor.get(p.id) ?? [] }))
    .sort((a, b) => b.clases.length - a.clases.length || a.nombre.localeCompare(b.nombre, "es"));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="cdaf-headline">Academias</h1>
          <p className="text-muted-foreground mt-1.5 text-sm">
            La semana del club: qué dicta cada profesor y quiénes vienen.
          </p>
        </div>
        {puedeEditar && (
          <Link href="/academias/clase/nueva" className={buttonVariants()}>+ Nueva clase</Link>
        )}
      </div>

      {aviso && (
        <p className="border-lime/50 bg-lime/10 rounded-xl border px-4 py-3 text-sm">{aviso}</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Clases a la semana" valor={cs.length} />
        <Kpi label="Cupos ocupados" valor={totalNinos} />
        <Kpi label="Horas de cancha" valor={horasCancha % 1 ? horasCancha.toFixed(1) : String(horasCancha)} />
        <Kpi label="Profesores" valor={filas.filter((f) => f.clases.length > 0).length} />
      </div>

      <section className="ring-foreground/[0.06] bg-card overflow-x-auto rounded-xl shadow-sm ring-1">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-border border-b">
              <th className="text-muted-foreground cdaf-eyebrow w-44 px-4 py-3 text-left text-[11px]">Profesor</th>
              {DIAS_SEMANA.map((d) => (
                <th key={d} className="text-muted-foreground cdaf-eyebrow px-2 py-3 text-left text-[11px]">
                  {DIA_CORTO[d]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.id} className="border-border/60 border-b last:border-0 align-top">
                <td className="px-4 py-3">
                  <Link href={`/academias/profesor/${f.id}`} className="font-medium hover:underline">
                    {f.nombre}
                  </Link>
                  <p className="text-muted-foreground mt-0.5 text-[11px] tabular-nums">
                    {f.clases.length === 0
                      ? "sin clases"
                      : `${f.clases.length} ${f.clases.length === 1 ? "clase" : "clases"} · ${f.clases.reduce((n, c) => n + c.ninos, 0)} niños`}
                  </p>
                </td>
                {DIAS_SEMANA.map((d) => {
                  const delDia = f.clases
                    .filter((c) => c.dia_semana === d)
                    .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
                  return (
                    <td key={d} className="px-2 py-3">
                      <div className="flex flex-col gap-1">
                        {delDia.map((c) => (
                          <Link
                            key={c.clase_id}
                            href={`/academias/clase/${c.clase_id}`}
                            className="hover:border-lime border-border bg-background block rounded-lg border px-2 py-1.5 transition-colors"
                          >
                            <span className="block text-[12px] font-medium tabular-nums">
                              {hhmm(c.hora_inicio)}
                            </span>
                            <span className="text-muted-foreground block text-[11px] tabular-nums">
                              {c.ninos} {c.ninos === 1 ? "niño" : "niños"}
                              {c.competencia > 0 && <span className="text-[#5b6300]"> · {c.competencia} comp.</span>}
                            </span>
                          </Link>
                        ))}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <p className="text-muted-foreground text-xs">
        Una clase es un profesor, un día y una hora. Recreativa y competencia conviven en la misma
        clase — la categoría es de cada niño, y decide cómo se le cobra.
      </p>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="cdaf-title text-base">Matrícula</h2>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Quién está en cada academia. De aquí sale el cobro: cada una apunta a su servicio de Siigo.
            </p>
          </div>
          {puedeEditar && (
            <Link href="/academias/nueva" className={buttonVariants({ variant: "outline", size: "sm" })}>
              + Nueva academia
            </Link>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(academias ?? []).map((a) => (
            <Link
              key={a.id}
              href={`/academias/${a.id}`}
              className="hover:border-lime ring-foreground/[0.06] bg-card block rounded-xl p-4 shadow-sm ring-1 transition-all hover:-translate-y-0.5"
            >
              <p className="cdaf-title text-[15px]">{a.nombre}</p>
              <div className="mt-2 flex items-center gap-2">
                <Badge variant={a.deporte === "tenis" ? "secondary" : "outline"}>{a.deporte}</Badge>
                {!a.activa && <Badge variant="outline">Inactiva</Badge>}
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function Kpi({ label, valor }: { label: string; valor: number | string }) {
  return (
    <div className="ring-foreground/[0.06] bg-card rounded-xl px-4.5 py-4 shadow-sm ring-1">
      <p className="cdaf-eyebrow text-muted-foreground text-[11px]">{label}</p>
      <p className="font-heading mt-1 text-[26px] font-bold tabular-nums">{valor}</p>
    </div>
  );
}
