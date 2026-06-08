import Link from "next/link";
import Image from "next/image";
import { buttonVariants } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="bg-stadium flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center text-white">
      <Image
        src="/logo-cdaf.png"
        alt="Centro Deportivo Alejandro Falla"
        width={96}
        height={96}
        className="rounded"
        priority
      />
      <p className="cdaf-eyebrow text-lime">Centro Deportivo Alejandro Falla</p>
      <h1 className="cdaf-display text-white">Centro de Control</h1>
      <p className="max-w-md text-white/70">
        Plataforma de gestión y CRM del club. En construcción.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-4">
        <Link href="/login" className={buttonVariants()}>
          Ingresar
        </Link>
        <Link
          href="/styleguide"
          className="text-sm text-white/70 underline-offset-4 hover:text-white hover:underline"
        >
          Ver sistema de diseño
        </Link>
      </div>
    </main>
  );
}
