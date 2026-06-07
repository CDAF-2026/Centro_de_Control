import type { AppRole } from "@/lib/database.types";

export const ROLE_LABEL: Record<AppRole, string> = {
  superadmin: "Superadministrador",
  coord_admin: "Coord. Administrativo",
  coord_deportivo: "Coord. Deportivo",
  recepcion: "Recepción",
  profesor: "Profesor",
};

export const ROLE_OPTIONS: { value: AppRole; label: string }[] = (
  Object.keys(ROLE_LABEL) as AppRole[]
).map((r) => ({ value: r, label: ROLE_LABEL[r] }));
