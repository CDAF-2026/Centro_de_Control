import Image from "next/image";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (await getUser()) redirect("/dashboard");

  return (
    <main className="bg-stadium flex min-h-screen items-center justify-center p-6">
      <div className="bg-card w-full max-w-sm space-y-6 rounded-lg p-8 shadow-lg">
        <div className="flex flex-col items-center gap-3 text-center">
          <Image
            src="/logo-cdaf.png"
            alt="Centro Deportivo Alejandro Falla"
            width={64}
            height={64}
            className="rounded"
            priority
          />
          <div>
            <p className="cdaf-eyebrow text-muted-foreground">Centro de Control</p>
            <h1 className="cdaf-title">Ingresar</h1>
          </div>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
