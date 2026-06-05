import { requireRole } from "@/lib/auth";
import { rolesForModule } from "@/lib/auth/permissions";
import { ModulePlaceholder } from "@/components/module-placeholder";

export default async function PagosPage() {
  await requireRole(rolesForModule("bolsa_pagos"));
  return (
    <ModulePlaceholder
      title="Bolsa de pagos (Siigo)"
      sprint="Sprint 4"
      description="Importación y conciliación de pagos de Siigo contra cliente + servicio."
    />
  );
}
