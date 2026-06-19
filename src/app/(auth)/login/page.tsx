import Image from "next/image";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (await getUser()) redirect("/dashboard");
  const year = new Date().getFullYear();

  return (
    <main className="bg-stadium relative flex min-h-screen items-center justify-center overflow-hidden p-6">
      {/* Destello de cancha */}
      <div
        aria-hidden
        className="bg-primary/10 pointer-events-none absolute -top-1/4 left-1/2 size-[42rem] -translate-x-1/2 rounded-full blur-3xl"
      />
      <div className="relative w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="bg-primary/10 ring-primary/20 flex size-16 items-center justify-center rounded-2xl ring-1">
            <Image src="/logo-cdaf.png" alt="CDAF" width={44} height={44} className="rounded-lg" priority />
          </div>
          <div className="space-y-1">
            <p className="cdaf-eyebrow text-primary">Centro Deportivo Alejandro Falla</p>
            <h1 className="cdaf-title text-white">Centro de Control</h1>
          </div>
        </div>

        <div className="bg-card rounded-2xl p-7 shadow-xl ring-1 ring-white/5">
          <div className="mb-5">
            <h2 className="font-heading text-lg font-semibold tracking-tight">Ingresar</h2>
            <p className="text-muted-foreground text-sm">Accede con tu correo y contraseña.</p>
          </div>
          <LoginForm />
        </div>

        <p className="mt-6 text-center text-xs text-white/40">
          © {year} Centro Deportivo Alejandro Falla
        </p>
      </div>
    </main>
  );
}
