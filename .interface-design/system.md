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

### Dashboard (rediseño 2026-11, gráficas con Apache ECharts; reemplaza al de julio)
- **Claro, como el resto de la plataforma.** Se probó una versión oscura y Laura la descartó.
- **Banner marcador de hoy** (se conserva del diseño de julio): `bg-stadium` redondeado 2xl
  + destellos `bg-primary/15 blur-3xl`, eyebrow lima con tracking amplio, saludo Montserrat
  itálica, número del día en lima con `CountUp`. Es lo único oscuro de la pantalla.
- **Orden** (decidido por Laura): marcador de hoy → avisos → 4 indicadores (Facturado,
  Cobrado, Por cobrar, Cartera total) → Cobrado por día + Facturado vs. anterior (6/6) →
  Ingreso por servicio + Últimos 7 días (4/8) → Top clientes + Top deudores (4/8) → Reloj
  de las canchas + Clases por entrenador (6/6). Rejilla de 12 columnas desde `xl`; una
  columna por debajo. **En cada fila las dos tarjetas miden lo mismo de alto.**
- **Indicador**: etiqueta 11px en mayúsculas + cifra `font-heading` 26px + un renglón de
  contexto + minigráfica o medidor de dos tramos (grafito = resuelto, ámbar = lo que falta).
- **Panel**: `bg-card border rounded-xl p-5 shadow-sm`; título `font-heading` 14px en
  mayúsculas + qué mide. El selector de forma (barras/línea/área, dona/bloques…) usa el
  mismo aspecto que el selector de periodo: `bg-muted rounded-lg p-1`, activo `bg-card shadow-sm`.
- **Color en las gráficas**: el dato principal en **grafito** `#37474f`; la lima solo de
  acento (relleno bajo una línea, barra de zoom) porque sobre blanco no se lee como barra.
  Comparación en gris `#8a979e`. Tenis azul `#2a78d6`, pádel `#8fa01f`. Sube = `#46530a`,
  baja = `destructive`, siempre con flecha ▲▼. Servicios: tabla propia por clave
  (`tablero-formato.ts`), no `servicios.color`.
- **Lectura**: cada gráfica lleva título, qué mide, eje con unidades y las cifras clave
  escritas (el día más alto, el promedio, el final de cada curva); el tooltip amplía, nunca
  es la única forma de leer un valor. La dona lleva debajo su lista con valor y porcentaje.
- **Gráfico propio que queda**: `CountUp` (marcador, ease-out cúbico, respeta reduced-motion).
- **Entrada escalonada**: `animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-500`
  + `animationDelay` de 80 ms por sección (tw-animate-css).
- **Ranking con barra**: nº en círculo + nombre + monto + barra `h-1.5 rounded-full`
  (lima para actividad/hoy; charcoal para dinero).
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
