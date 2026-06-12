import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { CierreToast } from "./cierre-toast";

export default async function CierrePage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string }>;
}) {
  const profile = await requireRole(rolesForModule("cierre_clase"));
  const { ok } = await searchParams;
  const esProfesor = profile.role === "profesor";

  const supabase = await createClient();
  let q = supabase
    .from("clases")
    .select("id, fecha, hora_inicio, tipo, deporte, profesor_id, cliente_id, academia_id")
    .eq("estado", "programada")
    .order("fecha");
  if (esProfesor) q = q.eq("profesor_id", profile.id);
  const { data: clases } = await q;
  const lista = clases ?? [];

  // Nombres de profesor / deportista (individual) / academia
  const profIds = [...new Set(lista.map((c) => c.profesor_id).filter((x): x is string => !!x))];
  const cliIds = [
    ...new Set(lista.filter((c) => c.tipo === "individual").map((c) => c.cliente_id).filter((x): x is number => x != null)),
  ];
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

  const now = Date.now();

  return (
    <div className="space-y-6">
      {ok && <CierreToast estado={ok} />}
      <h1 className="cdaf-headline">
        {esProfesor ? "Mis clases por cerrar" : "Clases pendientes de cierre"}
      </h1>

      {lista.length === 0 && <p className="text-muted-foreground">No hay clases pendientes. 🎾</p>}

      <div className="space-y-2">
        {lista.map((c) => {
          const dt = new Date(`${c.fecha}T${c.hora_inicio ?? "23:59"}:00`);
          const vencida = now > dt.getTime() + 24 * 3600 * 1000;
          const quien =
            c.tipo === "academia"
              ? `Academia: ${c.academia_id ? acaName.get(c.academia_id) ?? "—" : "—"}`
              : c.cliente_id
                ? cliName.get(c.cliente_id) ?? "—"
                : "Sin deportista";
          const profe = c.profesor_id ? profName.get(c.profesor_id) ?? "—" : "Sin profesor";
          return (
            <div key={c.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div>
                <p className="font-medium">{quien}</p>
                <p className="text-muted-foreground text-sm">
                  {c.fecha} {c.hora_inicio?.slice(0, 5) ?? ""} ·{" "}
                  {c.tipo === "academia" ? "Academia" : "Individual"}
                  {c.deporte ? ` · ${c.deporte}` : ""} · Profe: {profe}
                </p>
                {vencida && (
                  <Badge variant="destructive" className="mt-1">+24 h sin cerrar</Badge>
                )}
              </div>
              <Link href={`/cierre/${c.id}`} className={buttonVariants({ size: "sm" })}>
                Cerrar
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
