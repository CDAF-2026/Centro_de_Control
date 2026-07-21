import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ClaseForm } from "./clase-form";

export default async function NuevaClasePage() {
  await requireRole(["superadmin", "coord_admin", "coord_deportivo", "recepcion"]);
  const supabase = await createClient();
  const [{ data: profesores }, { data: pqRaw }] = await Promise.all([
    supabase.from("profiles").select("id, nombre").eq("role", "profesor").order("nombre"),
    supabase
      .from("paquetes_cliente")
      .select("id, miembro_id, catalogo_id, num_clases, clases_consumidas")
      .eq("estado", "activo"),
  ]);

  // Nombre del catálogo para etiquetar cada paquete
  const catIds = [...new Set((pqRaw ?? []).map((p) => p.catalogo_id).filter((x): x is number => x != null))];
  const catName = new Map<number, string>();
  if (catIds.length) {
    const { data: cats } = await supabase.from("paquetes_catalogo").select("id, nombre").in("id", catIds);
    for (const c of cats ?? []) catName.set(c.id, c.nombre);
  }

  const paquetes = (pqRaw ?? [])
    .map((p) => ({ ...p, saldo: p.num_clases - p.clases_consumidas }))
    .filter((p) => p.saldo > 0)
    .map((p) => ({
      id: p.id,
      miembroId: p.miembro_id,
      label: `${p.catalogo_id ? catName.get(p.catalogo_id) ?? "Paquete" : "Paquete"} · ${p.saldo}/${p.num_clases} disponibles`,
    }));

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <Link href="/clases" className="text-muted-foreground text-sm hover:underline">
          ← Calendario
        </Link>
        <h1 className="cdaf-headline mt-1">Nueva clase individual</h1>
      </div>
      <ClaseForm profesores={profesores ?? []} paquetes={paquetes} />
    </div>
  );
}
