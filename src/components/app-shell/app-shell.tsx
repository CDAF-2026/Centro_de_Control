"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Menu, LogOut, X } from "lucide-react";
import { NAV_ITEMS } from "@/lib/nav";
import { can } from "@/lib/auth/permissions";
import { logout } from "@/lib/auth/actions";
import { iniciales } from "@/lib/avatar";
import { cn } from "@/lib/utils";
import { NotasCampana } from "./notas-campana";
import type { AppRole } from "@/lib/database.types";

const ROLE_LABEL: Record<AppRole, string> = {
  superadmin: "Superadministrador",
  coord_admin: "Coord. Administrativo",
  coord_deportivo: "Coord. Deportivo",
  recepcion: "Recepción",
  profesor: "Profesor",
};

/** Foto de perfil, o las iniciales mientras no haya. */
function Avatar({
  url,
  nombre,
  className,
}: {
  url: string | null;
  nombre: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold",
        className,
      )}
    >
      {url ? (
        <Image src={url} alt="" fill sizes="40px" className="object-cover" />
      ) : (
        iniciales(nombre)
      )}
    </span>
  );
}

export function AppShell({
  role,
  nombre,
  perfilId,
  avatarUrl,
  notasSinLeer,
  children,
}: {
  role: AppRole;
  nombre: string;
  perfilId: string;
  avatarUrl: string | null;
  notasSinLeer: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const items = NAV_ITEMS.filter((i) => can(role, i.module));
  const current = items.find(
    (i) => pathname === i.href || pathname.startsWith(`${i.href}/`),
  );
  const pageTitle = current?.label ?? "Centro de Control";
  const PageIcon = current?.icon;

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside
        className={cn(
          "bg-sidebar text-sidebar-foreground border-sidebar-border fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r transition-transform duration-200 md:static md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Marca */}
        <div className="flex items-center gap-3 px-5 py-5">
          <div className="bg-sidebar-primary/10 ring-sidebar-primary/25 flex size-9 shrink-0 items-center justify-center rounded-lg ring-1">
            <Image src="/logo-cdaf.png" alt="CDAF" width={24} height={24} className="rounded" />
          </div>
          <div className="min-w-0 leading-tight">
            <p className="cdaf-eyebrow text-sidebar-primary">Centro de Control</p>
            <p className="text-sidebar-foreground/55 truncate text-xs">Alejandro Falla</p>
          </div>
          <button
            type="button"
            className="text-sidebar-foreground/70 hover:text-sidebar-foreground ml-auto md:hidden"
            onClick={() => setOpen(false)}
            aria-label="Cerrar menú"
          >
            <X className="size-5" />
          </button>
        </div>

        <p className="text-sidebar-foreground/40 px-5 pt-2 pb-1 text-[11px] font-semibold tracking-wider uppercase">
          Menú
        </p>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-3">
          {items.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent/70 font-semibold text-white"
                    : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-white/5",
                )}
              >
                {active && (
                  <span className="bg-sidebar-primary absolute top-1/2 left-0 h-5 w-1 -translate-y-1/2 rounded-r-full" />
                )}
                <Icon
                  className={cn(
                    "size-4 shrink-0 transition-colors",
                    active
                      ? "text-sidebar-primary"
                      : "text-sidebar-foreground/45 group-hover:text-sidebar-foreground",
                  )}
                />
                {item.label}
                {item.module === "notas" && notasSinLeer > 0 && (
                  <span className="bg-sidebar-primary text-sidebar-primary-foreground ml-auto flex min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] leading-4 font-bold">
                    {notasSinLeer > 9 ? "9+" : notasSinLeer}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Identidad + salir */}
        <div className="border-sidebar-border border-t p-3">
          <Link
            href="/perfil"
            onClick={() => setOpen(false)}
            className="mb-1 flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-white/5"
          >
            <Avatar
              url={avatarUrl}
              nombre={nombre}
              className="bg-sidebar-primary text-sidebar-primary-foreground size-8 text-xs"
            />
            <span className="min-w-0 leading-tight">
              <span className="text-sidebar-foreground block truncate text-sm font-medium">{nombre}</span>
              <span className="text-sidebar-foreground/50 block truncate text-xs">{ROLE_LABEL[role]}</span>
            </span>
          </Link>
          <form action={logout}>
            <button
              type="submit"
              className="text-sidebar-foreground/70 hover:text-sidebar-foreground flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-white/5"
            >
              <LogOut className="size-4 shrink-0" />
              Salir
            </button>
          </form>
        </div>
      </aside>

      {/* Overlay móvil */}
      {open && (
        <button
          type="button"
          aria-label="Cerrar menú"
          className="bg-stadium/50 fixed inset-0 z-30 backdrop-blur-sm md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Columna principal */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="bg-card/80 border-border sticky top-0 z-20 flex items-center gap-3 border-b px-4 py-3 backdrop-blur md:px-8">
          <button
            type="button"
            className="text-foreground md:hidden"
            onClick={() => setOpen(true)}
            aria-label="Abrir menú"
          >
            <Menu className="size-5" />
          </button>
          <div className="flex min-w-0 items-center gap-2.5">
            {PageIcon && (
              <span className="bg-primary/15 text-charcoal ring-primary/25 hidden size-8 shrink-0 items-center justify-center rounded-lg ring-1 sm:flex">
                <PageIcon className="size-4" />
              </span>
            )}
            <span className="font-heading text-foreground truncate text-base font-semibold tracking-tight">
              {pageTitle}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <NotasCampana perfilId={perfilId} inicial={notasSinLeer} />
            <Link
              href="/perfil"
              aria-label="Mi perfil"
              title="Mi perfil"
              className="group flex items-center gap-3 rounded-lg transition-opacity hover:opacity-80"
            >
              <span className="hidden text-right leading-tight sm:block">
                <span className="text-foreground block text-sm font-medium">{nombre}</span>
                <span className="text-muted-foreground block text-xs">{ROLE_LABEL[role]}</span>
              </span>
              <Avatar
                url={avatarUrl}
                nombre={nombre}
                className="bg-primary text-primary-foreground ring-primary/20 group-hover:ring-primary/50 size-9 text-xs ring-2 transition-[--tw-ring-color]"
              />
            </Link>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
