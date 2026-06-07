"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Menu, LogOut } from "lucide-react";
import { NAV_ITEMS } from "@/lib/nav";
import { can } from "@/lib/auth/permissions";
import { logout } from "@/lib/auth/actions";
import { cn } from "@/lib/utils";
import type { AppRole } from "@/lib/database.types";

const ROLE_LABEL: Record<AppRole, string> = {
  superadmin: "Superadministrador",
  coord_admin: "Coord. Administrativo",
  coord_deportivo: "Coord. Deportivo",
  recepcion: "Recepción",
  profesor: "Profesor",
};

export function AppShell({
  role,
  nombre,
  children,
}: {
  role: AppRole;
  nombre: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const items = NAV_ITEMS.filter((i) => can(role, i.module));

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside
        className={cn(
          "bg-sidebar text-sidebar-foreground fixed inset-y-0 left-0 z-40 flex w-64 flex-col transition-transform md:static md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="border-sidebar-border flex items-center gap-2 border-b px-5 py-4">
          <Image src="/logo-cdaf.png" alt="CDAF" width={32} height={32} className="rounded" />
          <span className="cdaf-eyebrow">Centro de Control</span>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {items.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground font-semibold"
                    : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <form action={logout} className="border-sidebar-border border-t p-3">
          <button
            type="submit"
            className="hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors"
          >
            <LogOut className="size-4 shrink-0" />
            Salir
          </button>
        </form>
      </aside>

      {/* Overlay móvil */}
      {open && (
        <button
          type="button"
          aria-label="Cerrar menú"
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Columna principal */}
      <div className="flex flex-1 flex-col">
        <header className="bg-card flex items-center gap-3 border-b px-4 py-3 md:px-6">
          <button
            type="button"
            className="md:hidden"
            onClick={() => setOpen(true)}
            aria-label="Abrir menú"
          >
            <Menu className="size-5" />
          </button>
          <div className="flex-1" />
          <span className="text-muted-foreground text-sm">
            {nombre} · {ROLE_LABEL[role]}
          </span>
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
