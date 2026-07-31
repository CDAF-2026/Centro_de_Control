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
import { NotaCard } from "@/app/(app)/notas/nota-card";
import type { NotaVista } from "@/lib/notas";

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

      <section className="space-y-4">
        <h2 className="cdaf-title">Tablón de notas</h2>
        <p className="text-muted-foreground text-sm">
          Post-it con chincheta sobre hoja rayada. Se endereza al pasar el mouse. Ámbar = urgente,
          apagado = resuelta; la lima queda solo en la chincheta y en las menciones.
        </p>
        <TablonDemo />
      </section>
    </main>
  );
}

/** Muestra del tablón de /notas con datos de ejemplo (no toca la base). */
function TablonDemo() {
  const base = {
    autorId: "demo",
    editadaEl: null,
    resueltaEl: null,
    resueltaPorNombre: null,
    soyDestinatario: true,
    leidaPorMi: false,
    clienteId: null,
    claseId: null,
    eventoId: null,
    nComentarios: 0,
    puedeEditar: true,
    puedeResolver: true,
    puedeEliminar: true,
  } as const;

  const ejemplos: NotaVista[] = [
    {
      ...base,
      id: 1,
      texto:
        "El cliente Pérez no pagó la clase de hoy, quedó de traer el efectivo mañana. @Ana Ruiz recuérdaselo cuando llegue.",
      autorNombre: "Camila Ríos",
      prioridad: "alta",
      estado: "pendiente",
      paraTodos: false,
      createdAt: new Date(Date.now() - 25 * 60000).toISOString(),
      destinatarios: [{ id: "a", nombre: "Ana Ruiz", leida: false }],
      enlace: { label: "Pérez, Juan", href: "#" },
    },
    {
      ...base,
      id: 2,
      texto: "Se cancela la academia de la tarde por lluvia. Ya avisamos a los papás por WhatsApp.",
      autorNombre: "Camila Ríos",
      prioridad: "normal",
      estado: "pendiente",
      paraTodos: true,
      createdAt: new Date(Date.now() - 3 * 3600000).toISOString(),
      destinatarios: [],
      enlace: null,
      nComentarios: 2,
    },
    {
      ...base,
      id: 3,
      texto: "Faltan pelotas en la cancha 3, pedir al proveedor.",
      autorNombre: "Diego Salas",
      prioridad: "normal",
      estado: "resuelta",
      paraTodos: true,
      createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
      resueltaEl: new Date().toISOString(),
      resueltaPorNombre: "Ana Ruiz",
      destinatarios: [],
      enlace: null,
    },
  ];

  return (
    <div className="relative isolate px-2 py-4 sm:px-4">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 rounded-2xl opacity-[0.07]"
        style={{
          backgroundImage: "linear-gradient(var(--color-charcoal) 1px, transparent 1px)",
          backgroundSize: "100% 32px",
        }}
      />
      <div className="grid items-start gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {ejemplos.map((n) => (
          <NotaCard key={n.id} nota={n} staff={[]} puedeResolver />
        ))}
      </div>
    </div>
  );
}
