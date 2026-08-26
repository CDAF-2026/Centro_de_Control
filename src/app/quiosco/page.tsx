import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fechaLarga } from "@/lib/fecha";
import { Quiosco } from "./quiosco";
import type { QuioscoEstado } from "@/lib/database.types";

/**
 * El quiósco: la pantalla que vive abierta en el PC de recepción.
 *
 * Vive FUERA del grupo `(app)` a propósito, así no hereda el menú ni el
 * encabezado: es un aparato de una sola función, no una pantalla más del
 * sistema. La abre una cuenta «Quiósco» que no puede ver ningún otro módulo, y
 * el superadministrador para poder probarla.
 *
 * ⚠️ No se cachea: la lista muestra quién está en turno AHORA MISMO.
 */
export const dynamic = "force-dynamic";

export default async function QuioscoPage() {
  await requireRole(["quiosco", "superadmin"]);

  const supabase = await createClient();
  const { data } = await supabase.rpc("quiosco_estado");
  const gente: QuioscoEstado[] = data ?? [];

  return <Quiosco gente={gente} fecha={fechaLarga(new Date().toISOString())} />;
}
