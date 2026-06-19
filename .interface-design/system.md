# Sistema de diseño — Centro de Control (CDAF)

**Dirección:** "precisión de marcador + energía de cancha". Interfaz de gestión
(admin/CRM) para un club de tenis/pádel. Superficies calmas, lima como
acento/estado (nunca decoración), profundidad por sombras suaves.

## Profundidad
Estrategia **única: sombras suaves** (no borders-only, no sombras dramáticas).
Escala en `globals.css` (`@theme`): `--shadow-2xs` … `--shadow-xl`.
Tarjetas → `shadow-sm`; modales → `shadow-xl`; popovers → `shadow-md/lg`.
Hairline: `ring-1 ring-foreground/[0.06]` o `border-border` (frío, suave).

## Espaciado
Base 4px (escala Tailwind). Secciones `space-y-6`; grids `gap-4`; contenido
centrado `max-w-7xl` con `p-4 md:p-8`.

## Radios
`--radius: 0.5rem` (8px). Botones/inputs `rounded-lg`, tarjetas `rounded-xl`,
modales `rounded-2xl`. Badges = pill (`rounded-4xl`).

## Color (tokens CDAF — sin hex sueltos)
- Marca: Impact Lime `#d4e157` (primary/CTA + acento de estado).
- Court Charcoal `#37474f`, Stadium Black `#1a1c1e` (sidebar / login).
- Fondo `#f4f6f5` (aire de cancha), card blanco.
- Secundario / borde / inputs: grises fríos limpios; texto secundario slate `#5c6b73`.
- Semánticos: success = lima, warning = ámbar `#f2b53d`, destructive = rojo.

## Tipografía
- Display/headings: Montserrat (`font-heading`/`font-display`), itálica mayúsculas
  para la voz de marca (`.cdaf-display/.headline/.title/.eyebrow`).
- Cuerpo: Open Sans (`font-sans`).
- Datos/números: `tabular-nums` + `font-heading` semibold (estilo marcador).

## Patrones reutilizables
- **Tablas** → envolver en `.cdaf-table-wrap` y `<table className="cdaf-table">`.
  El encabezado (mayúsculas/tracking/gris) lo heredan los `<th>` por cascada;
  no hay que estilizar cada celda.
- **KPI marcador** (dashboard): eyebrow + número `tabular-nums` + chip de ícono
  (lima `bg-primary/15 ring-primary/25` en destacados; `bg-muted` el resto).
- **Sidebar activo**: riel lima `bg-sidebar-primary` (w-1, redondeado a la derecha)
  + `bg-sidebar-accent/70` + ícono en lima. Sidebar oscuro = firma de marca.
- **Header**: chip ícono + título de la página (`bg-primary/15`), sticky con blur
  + chip de usuario con iniciales.
- **EmptyState** (`@/components/ui/empty-state`): chip de ícono + título +
  descripción + acción opcional. Usar en listas/tablas vacías.
- **Badge de estado**: `success` (lima), `warning` (ámbar); `outline` para etiquetas
  neutras; `destructive` para alertas.
- **Login/landing**: fondo `bg-stadium` + destello `bg-primary/10 blur-3xl`.

## Reglas
- Una sola estrategia de profundidad (sombras).
- Lima solo para acción/estado/acento; nunca decorativa ni en superficies grandes.
- Mismo matiz para superficies; variar solo la luminosidad.
- No tocar lógica de negocio al ajustar estilo (APIs de componentes estables).
