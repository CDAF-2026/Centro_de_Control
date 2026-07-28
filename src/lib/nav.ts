import {
  LayoutDashboard,
  Users,
  UserCog,
  GraduationCap,
  Package,
  CalendarDays,
  StickyNote,
  ClipboardCheck,
  Trophy,
  Wallet,
  Calculator,
  BarChart3,
  Bot,
  Settings,
  type LucideIcon,
} from "lucide-react";
import type { ModuleKey } from "@/lib/auth/permissions";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  module: ModuleKey;
};

/** Navegación principal. Cada ítem se filtra por la matriz de permisos del rol. */
export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, module: "dashboard" },
  { label: "Clientes", href: "/clientes", icon: Users, module: "clientes" },
  { label: "Empleados", href: "/empleados", icon: UserCog, module: "empleados" },
  { label: "Academias", href: "/academias", icon: GraduationCap, module: "academias" },
  { label: "Paquetes", href: "/paquetes", icon: Package, module: "paquetes" },
  { label: "Clases", href: "/clases", icon: CalendarDays, module: "clases" },
  { label: "Eventos", href: "/eventos", icon: Trophy, module: "eventos" },
  { label: "Notas", href: "/notas", icon: StickyNote, module: "notas" },
  { label: "Cierre de clases", href: "/cierre", icon: ClipboardCheck, module: "cierre_clase" },
  { label: "Pagos", href: "/pagos", icon: Wallet, module: "bolsa_pagos" },
  { label: "Liquidación", href: "/liquidacion", icon: Calculator, module: "liquidacion" },
  { label: "Reportes", href: "/reportes", icon: BarChart3, module: "reportes_operativos" },
  { label: "Agente IA", href: "/agente", icon: Bot, module: "agente_ia" },
  { label: "Configuración", href: "/config", icon: Settings, module: "config" },
];
