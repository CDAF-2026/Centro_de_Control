import Link from "next/link";
import { cn } from "@/lib/utils";

const PESTANAS = [
  { id: "carta", nombre: "Carta", href: "/cafeteria" },
  { id: "pedidos", nombre: "Pedidos", href: "/cafeteria/pedidos" },
] as const;

/** Las dos pantallas del módulo: la carta que se administra y el historial de pedidos. */
export function Pestanas({ activa }: { activa: (typeof PESTANAS)[number]["id"] }) {
  return (
    <nav aria-label="Secciones de cafetería" className="bg-muted inline-flex rounded-lg p-1">
      {PESTANAS.map((p) => (
        <Link
          key={p.id}
          href={p.href}
          aria-current={p.id === activa ? "page" : undefined}
          className={cn(
            "rounded-md px-4 py-1.5 text-sm font-semibold transition-colors",
            p.id === activa ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {p.nombre}
        </Link>
      ))}
    </nav>
  );
}
