import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function Swatch({
  name,
  varName,
  className,
}: {
  name: string;
  varName: string;
  className: string;
}) {
  return (
    <div className="overflow-hidden rounded-md border">
      <div className={`h-16 ${className}`} />
      <div className="p-2">
        <p className="text-sm font-semibold">{name}</p>
        <p className="text-xs text-muted-foreground">{varName}</p>
      </div>
    </div>
  );
}

export default function StyleguidePage() {
  return (
    <main className="mx-auto max-w-5xl space-y-12 p-8">
      <header className="flex items-center gap-4">
        <Image
          src="/logo-cdaf.png"
          alt="CDAF"
          width={56}
          height={56}
          className="rounded"
        />
        <div>
          <p className="cdaf-eyebrow text-muted-foreground">Sistema de diseño</p>
          <h1 className="cdaf-display">Impact Lime</h1>
        </div>
      </header>

      <section className="space-y-4">
        <h2 className="cdaf-title">Colores de marca</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Swatch name="Impact Lime" varName="--cdaf-impact-lime" className="bg-lime" />
          <Swatch name="Court Charcoal" varName="--cdaf-court-charcoal" className="bg-charcoal" />
          <Swatch name="Stadium Black" varName="--cdaf-stadium-black" className="bg-stadium" />
          <Swatch name="Primary" varName="--primary" className="bg-primary" />
          <Swatch name="Secondary" varName="--secondary" className="bg-secondary" />
          <Swatch name="Muted" varName="--muted" className="bg-muted" />
          <Swatch name="Destructive" varName="--destructive" className="bg-destructive" />
          <Swatch name="Warning" varName="--cdaf-warning" className="bg-warning" />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="cdaf-title">Tipografía</h2>
        <p className="cdaf-display">Display · Montserrat 900</p>
        <p className="cdaf-headline">Headline · Montserrat 800</p>
        <p className="cdaf-title">Title · Montserrat 700</p>
        <p className="cdaf-eyebrow text-muted-foreground">Eyebrow · Open Sans 700</p>
        <p className="text-lg">Body large · Open Sans. El control del club, en un solo lugar.</p>
        <p className="text-base text-muted-foreground">
          Body · Open Sans. Gestión de socios, clases, pagos y reportes.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="cdaf-title">Botones</h2>
        <div className="flex flex-wrap items-center gap-3">
          <Button>Reservar</Button>
          <Button variant="secondary">Secundario</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost ↗</Button>
          <Button variant="destructive">Eliminar</Button>
          <Button disabled>Deshabilitado</Button>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="cdaf-title">Badges</h2>
        <div className="flex flex-wrap gap-2">
          <Badge>Activo</Badge>
          <Badge variant="secondary">Tenis</Badge>
          <Badge variant="outline">Pádel</Badge>
          <Badge variant="destructive">Retirado</Badge>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="cdaf-title">Tarjeta + formulario</h2>
        <Card className="max-w-sm transition-transform duration-200 hover:-translate-y-1 hover:border-lime">
          <CardHeader>
            <CardTitle>Nuevo deportista</CardTitle>
            <CardDescription>Registra un cliente del club.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="n">Nombre</Label>
              <Input id="n" placeholder="Rafael Rodríguez" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="e">Email</Label>
              <Input id="e" type="email" placeholder="rafa@correo.com" />
            </div>
          </CardContent>
          <CardFooter>
            <Button className="w-full">Guardar</Button>
          </CardFooter>
        </Card>
      </section>
    </main>
  );
}
