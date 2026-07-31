import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="bg-stadium relative flex min-h-screen flex-col items-center justify-center overflow-hidden p-8 text-center">
      {/* Destello de cancha */}
      <div
        aria-hidden
        className="bg-primary/10 pointer-events-none absolute -top-1/3 left-1/2 size-[48rem] -translate-x-1/2 rounded-full blur-3xl"
      />
      <div className="relative flex flex-col items-center gap-6">
        <div className="bg-primary/10 ring-primary/20 flex size-24 items-center justify-center rounded-3xl ring-1">
          <Image src="/logo-cdaf.png" alt="CDAF" width={72} height={72} className="rounded-xl" priority />
        </div>
        <div className="space-y-2">
          <p className="cdaf-eyebrow text-primary">Centro Deportivo Alejandro Falla</p>
          <h1 className="cdaf-display text-white">Centro de Control</h1>
          <p className="mx-auto max-w-md text-white/60">
            Gestión y CRM del club: clientes, academias, paquetes, clases, cierres y
            conciliación — todo en un solo lugar.
          </p>
        </div>
        {/*
          Sin enlace al sistema de diseño: esta es la portada pública del club y
          no tiene por qué ofrecerle a un visitante una herramienta interna.
          `/styleguide` sigue existiendo y se llega por URL directa (no lleva
          datos reales, solo ejemplos inventados).
        */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link href="/login" className={buttonVariants({ size: "lg" })}>
            Ingresar <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>
    </main>
  );
}
