import { Clock } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { fechaLarga, saludo } from "@/lib/fecha";
import { EmptyState } from "@/components/ui/empty-state";
import { MarcarTurno } from "./marcar-turno";

/**
 * "Mi turno" — la pantalla con la que el personal por horas marca entrada y
 * salida (Camila, Juan, Santiago y Carlos).
 *
 * 🔒 Tiene UN solo trabajo: marcar. No muestra cuántas horas lleva la persona
 * —ni del día, ni de la semana, ni de turnos pasados— porque ese registro es
 * solo del superadministrador (decisión de Laura, 26-ago-2026). Y no es que
 * esté escondido: la política `turno_select` (migración 0083) solo le deja ver
 * su propio turno ABIERTO, así que aunque alguien pidiera los datos por fuera
 * de esta pantalla no obtendría nada.
 */
export default async function TurnosPage() {
  const profile = await requireRole(rolesForModule("turnos"));

  if (!profile.marca_turno) {
    return (
      <EmptyState
        icon={Clock}
        title="Tu cuenta no registra turnos"
        description="Solo el personal que se paga por horas marca entrada y salida. Si crees que deberías estar aquí, habla con el administrador."
      />
    );
  }

  const supabase = await createClient();

  // El turno abierto de ESTA persona. El filtro por `perfil_id` es necesario
  // aunque la política ya restrinja: al superadministrador la RLS le deja ver
  // todos, y sin él vería el turno abierto de cualquiera como si fuera suyo.
  const { data: abierto } = await supabase
    .from("turno")
    .select("id, inicio_el")
    .eq("perfil_id", profile.id)
    .is("fin_el", null)
    .maybeSingle();

  let pausaDesde: string | null = null;
  if (abierto) {
    const { data } = await supabase
      .from("turno_pausa")
      .select("inicio_el")
      .eq("turno_id", abierto.id)
      .is("fin_el", null)
      .maybeSingle();
    pausaDesde = data?.inicio_el ?? null;
  }

  const ahora = new Date().toISOString();

  return (
    <MarcarTurno
      nombre={(profile.nombre ?? "").trim().split(/\s+/)[0] || "Hola"}
      fecha={fechaLarga(ahora)}
      saludo={saludo(ahora)}
      inicioEl={abierto?.inicio_el ?? null}
      pausaDesde={pausaDesde}
    />
  );
}
