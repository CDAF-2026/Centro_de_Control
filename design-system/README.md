# Centro Deportivo Alejandro Falla — Design System

> Sistema de diseño para el Centro Deportivo Alejandro Falla — un club de tenis y pádel premium en Llanogrande / Rionegro (Colombia), fundado por el tenista profesional Alejandro Falla. Énfasis en alto rendimiento deportivo, instalaciones de calidad y formación.

## Sources used to build this system

| Source | Status | Notes |
|---|---|---|
| `uploads/DESIGN.md` | provided | Authoritative brand spec — "Impact Lime Athletic System". Colors, type, components, voice. |
| `uploads/Design_system.png` | provided | One-page visual style guide. Shows logo, palette, type specimens, button styles, sample cards, icon set. |
| `https://centrodeportivoaf.com/` | live site | Source of truth for real copy, staff photos, hero imagery, and current visual implementation. |
| `https://centrodeportivoaf.com/nosotros/` | live site | Brand voice samples: mission, vision, values, history, regulations. |
| `https://centrodeportivoaf.com/programas/` | live site | Program copy samples. |

The live WordPress site is built on a generic theme (likely Astra/Elementor) and **the published version is intentionally less polished than the DESIGN.md spec**. This design system codifies the DESIGN.md direction — heavy italic Montserrat, Impact Lime accents, charcoal cards — and treats the live site as the source of real photography, copy, and feature list.

## Brand at a glance

- **Name:** Centro Deportivo Alejandro Falla (CDAF)
- **Sport mix:** Tennis (kids, adults, high-performance) + Pádel
- **Audience:** Members, athletes, families; bilingual Spanish (primary).
- **Voice:** Confident, professional, motivational. Heavy on action verbs and uppercase emphasis.
- **Values (their words):** RESPETO · HONESTIDAD · COMPROMISO · DISCIPLINA
- **Style direction:** Corporate Modern × High-Contrast Bold. Heavy italic display type. Vibrant lime + industrial charcoal. Grid-based, "performance-first."

## Index of this design system

```
.
├── README.md                       ← you are here
├── SKILL.md                        ← Claude Code / Agent-Skill manifest
├── colors_and_type.css             ← canonical CSS vars (colors, type, spacing, radii, motion)
├── fonts/
│   └── README.md                   ← Montserrat + Open Sans (Google Fonts)
├── assets/
│   └── README.md                   ← Logos, photos, imagery (URLs to live CDN)
├── preview/                        ← Design-System-tab preview cards
│   ├── logo.html
│   ├── colors-brand.html
│   ├── colors-surfaces.html
│   ├── colors-semantic.html
│   ├── type-display.html
│   ├── type-scale.html
│   ├── type-treatments.html
│   ├── radii.html
│   ├── spacing.html
│   ├── elevation.html
│   ├── buttons.html
│   ├── chips-badges.html
│   ├── inputs.html
│   ├── trainer-card.html
│   ├── category-card.html
│   ├── navigation.html
│   ├── iconography.html
│   └── values-stencils.html
└── ui_kits/
    └── web/                        ← Marketing website UI kit
        ├── README.md
        ├── index.html              ← interactive home-page recreation
        ├── tokens.css
        ├── components.jsx          ← TopBar, Hero, CategoryCard, TrainerCard, Footer…
        ├── icons.jsx               ← Lucide + brand sport icons
        └── data.js                 ← real staff/copy
```

---

## CONTENT FUNDAMENTALS

### Voice & tone

- **Confident, motivational, professional.** The brand speaks like a head coach who runs a tight ship.
- **Action-oriented.** Copy leans into doing: "Reservar", "Ver más", "Encuéntranos", "VER PERFIL".
- **Spanish first, second person plural / institutional first-person plural** — *ofrecemos*, *contamos con*, *nuestras instalaciones*. The brand speaks as "we" (the club), not "I".
- **Direct, never cute.** No emoji. No exclamation spam (the lone "¡En Vivo!" sticker is intentional).
- **Bilingual when useful** — the broadcast pill uses Spanish; technical references (padel, tenis) remain lowercase as part of the visual rhythm.

### Casing

- **UPPERCASE** for: nav, button labels, eyebrow labels, section titles ("STAFF", "GALERíA", "ICONOGRAPHY"). This is load-bearing — the technical/athletic feel comes from these blocks of uppercase Montserrat.
- **lowercase** for: category card titles ("tenis niños", "tenis adultos", "padel") — a deliberate quirky counterpoint to the otherwise uppercase headlines.
- **Title Case** is rarely used. The system is mostly UPPERCASE display + sentence-case body.

### Real copy examples (from the live site)

> *"En el **Centro Deportivo Alejandro Falla** ofrecemos una variedad de eventos deportivos diseñados para promover la competencia sana y el disfrute del deporte."*

> *"Contamos con un equipo de **profesionales capacitados** para diseñar y coordinar el evento adecuado a las necesidades de cada cliente, asegurando una experiencia única y exitosa."*

> Button labels: **`VER MÁS ↗`** · **`RESERVAR`** · **`VER PERFIL`** · **`Reservar`** (the arrow ↗ is part of the ghost-link signature)

> Brand values, used as full-bleed stenciled hero overlays: **RESPETO · HONESTIDAD · COMPROMISO · DISCIPLINA**

### Do / Don't

- ✅ Do use uppercase Montserrat italic for hero & section titles.
- ✅ Do use second-person plural ("ofrecemos", "nuestras canchas").
- ✅ Do front-load action verbs in button labels.
- ❌ Don't use emoji.
- ❌ Don't break the staff/role pattern (`### Name` / *role*).
- ❌ Don't use English in the primary nav unless the page is translated wholesale.

---

## VISUAL FOUNDATIONS

### Colors

The palette is binary by design: **Impact Lime** (`#D4E157`) and **Court Charcoal** (`#37474F`/`#1A1C1E`), with white and surface-gray as connective tissue. Use lime as a pinpoint accent — primary CTAs, active states, the ball in the logo, status pills — never as a large background. Charcoal carries authority: dark hero sections, trainer cards, the bottom-bar nav. Avoid introducing additional accents; the tension between the two brand colors is the system's whole identity.

See `colors_and_type.css` for the full token list (M3-style tonal surfaces plus brand aliases `--accent`, `--bg-dark`, `--fg1`, etc).

### Typography

- **Montserrat** for everything that wants to feel athletic — ExtraBold 800 / Black 900, with italic reserved for brand-level messaging and primary section headers (display, h1, h2). UPPERCASE almost always.
- **Open Sans** for body, labels, micro-copy. Stays neutral and legible at small sizes so schedules/rules don't fight the headlines.
- The hierarchy is *aggressive headline ↔ calm body*. Don't soften display type; don't shout in body copy.

### Spacing & layout

- 8px base unit. Common rhythm: 16 / 24 / 32 / 40 / 64.
- Container max **1280px**, gutter **24px**.
- Page margins: **40px** desktop, **16px** mobile.
- Grid-based, columnar. Cards align to a strict 12-column layout; sections breathe with 64–80px vertical padding.

### Backgrounds & imagery

- Photography is high-saturation, on-court, action-leaning. Warm tones (clay, skin) against the cool charcoal/lime UI keeps things vibrant.
- **Full-bleed hero** with stenciled value words (RESPETO, COMPROMISO, etc) overlaying photography — signature treatment.
- Dark sections (Stadium Black) alternate with light Surface-Gray sections to set rhythm. **No gradients** in UI chrome (no purple haze). Photos may carry their own natural light.
- No hand-drawn illustrations. No textures/patterns. Trust the photo + type combination.

### Borders, corners, elevation

- **Corner radii:** 2px chips · **4px default** (buttons/inputs/small cards) · 8px large cards & images · `9999px` for avatars and circular icon badges.
- **Borders over shadows.** 1px Court Charcoal hairline is the preferred way to bound a surface.
- When shadows are used, keep them feathery: `0 2px 8px rgba(26,28,30,0.06)` or softer. Never deep drop shadows.
- **Card hover:** translate `-4px` up, optionally bump the border to Impact Lime — never deepen the shadow.

### Motion

- Restrained. Most interactions are simple opacity / color / 4px translate transitions, **200ms**, `cubic-bezier(0.16, 1, 0.3, 1)` (ease-out).
- Hover is always faster (120ms) than reveal (320ms). No bounce, no spring.
- The one playful motion: the live "¡En Vivo!" pill can pulse subtly.

### Interactive states

- **Hover (button):** primary lime button slightly darkens to `#C2CF47` (Lime Dim); outline buttons fill toward charcoal text.
- **Hover (card):** `translateY(-4px)`; border swaps charcoal → impact-lime.
- **Hover (link/ghost):** the underline appears in lime, the `↗` arrow rotates +15°.
- **Press / active:** scale `0.98`. No color flash.
- **Focus:** 2px outline in `--cdaf-primary` (`#5B6300`) at 2px offset — always visible, never `outline: none` without replacement.
- **Disabled:** 38% opacity on the element, no pointer.

### Transparency, blur, fixed elements

- The top nav can be `rgba(255,255,255,0.85)` with `backdrop-filter: blur(8px)` when sticky over imagery. Or a solid charcoal bar on dark pages.
- Avoid translucent surfaces inside content regions — it muddies the lime/charcoal contrast.
- Fixed elements: top bar, floating WhatsApp button (bottom-right, circular, lime fill, charcoal icon).

### Cards (recap)

- **Athletic card** (trainer, class): Court Charcoal background, white italic Montserrat title, lime CTA inside, square portrait with very subtle 1px border.
- **Category card** (tenis niños, padel): light surface, photo top, italic uppercase title in charcoal, "Ver más ↗" ghost link in lime — `4px` charcoal border, `-4px` lift on hover.
- **Surface card**: white, 1px outline-variant border, 16–24px internal padding, no rounded shadow.

---

## ICONOGRAPHY

The brand uses two complementary icon vocabularies:

1. **Brand sport icons** (custom): black filled tennis ball / padel racket / circular pin, all with a 2px **Impact Lime** outline on a black ball-shape. These are the "stencil" icons used in the values block and the logo system. We recreate the tennis ball and padel racket as inline SVGs in `ui_kits/web/icons.jsx` (geometry only — straight from the DESIGN.md visual). The user should drop final svg/png exports here if they have them; flag if higher-fidelity assets become available.
2. **UI icons** (utility): clean monoline, ~1.5–2px stroke, square caps. The live WordPress site uses **Font Awesome** for these (calendar, pin, clock, chat). For our UI kit we substitute **Lucide** (`https://unpkg.com/lucide@latest`) — matching stroke and grid (24×24), and **flag this substitution** so the user can confirm or swap back to Font Awesome.

**No emoji.** **No unicode glyphs** as icons (the lone `↗` arrow in ghost links is part of the type, not an icon). When an icon is needed but unavailable, leave the space and add a `TODO: icon` comment — never sub in an emoji.

---

## Caveats & substitutions (flagged)

- **Icon library:** the live site uses Font Awesome; this kit uses Lucide. If the user prefers Font Awesome we'll swap in FA Pro.
- **Brand sport icons** (tennis ball, padel racket): we drew minimal SVG versions from the DESIGN.md infographic. Higher-fidelity vector originals from the brand's designer would be preferable.
- **Images** are referenced via the live WP URLs to avoid bulk-downloading the brand library. See `assets/README.md` to mirror them locally.
- **Stencil value banners** (RESPETO, HONESTIDAD…) — we display the value words as type for now; if the brand has original stenciled raster banners they should drop in `assets/`.
