# UI Kit · Marketing website

A high-fidelity, interactive recreation of the Centro Deportivo Alejandro Falla
home experience — built against the **DESIGN.md** ("Impact Lime Athletic
System") direction and the live copy & photography from
`https://centrodeportivoaf.com/`.

## What's in the kit

`index.html` mounts an interactive marketing home page covering:

1. **TopBar** — sticky nav with the brand lockup, divider-separated links, and an inline RESERVAR CTA.
2. **Hero** — full-bleed photo with stencil value words running along the bottom, "¡En Vivo!" pill in the top-right, and a two-line italic title.
3. **Categories** — three picture cards (tenis niños, tenis adultos, padel) with the signature lowercase Montserrat title + ghost "Ver más ↗" link. Lift-on-hover + lime-border transition.
4. **Staff** — dark Court-Charcoal cards with italic white name and lime role line. Pulls real names and photos.
5. **Events / Sports split** — copy block + two tall photo tiles (tenis, padel) with a lime "Reservar" CTA pinned bottom-left.
6. **Gallery** — bento-style 3-column photo grid with hover-zoom and caption pills.
7. **Sponsors** — bordered text logos (placeholders for Easycancha, Fila, Coordinadora).
8. **Footer** — black, lime social-circles, link rows in uppercase Montserrat.
9. **Reserve modal** — sport / date / time form with primary CTA. Confirming pops a charcoal-lime toast.
10. **Floating WhatsApp** — bottom-right circular lime FAB.

## How it's wired

- `tokens.css` — local styles. Imports `../../colors_and_type.css` for the brand tokens, then defines component-scoped classes.
- `data.js` — single source of truth for nav, staff, categories, gallery, sports, sponsors. All photo URLs point at the live WordPress CDN.
- `icons.jsx` — minimal SVG icons. Brand sport icons (TennisBall, PadelRacket) follow the DESIGN.md stencil look. Utility icons are Lucide-style (substitution flagged in main README).
- `components.jsx` — every React component on the page. Compiled inline by Babel-standalone. Exports a single `window.CDAF_App` root.
- `index.html` — pinned React 18.3.1 + Babel 7.29.0 from unpkg. Mounts `CDAF_App` once Babel has loaded the JSX scripts.

## Interactions you can try

- Hit **RESERVAR** in the nav (or "RESERVAR CANCHA" / per-sport tiles) → reserve modal opens with disciplina / fecha / hora fields. Submitting fires a confirmation toast.
- Tap a **category card** → confirmation toast naming the chosen program.
- Hover any card → 4px lift, lime border (categories) / subtle lift only (staff & sports).
- Hover the ghost link → the **↗** rotates 15°.
- Click the **floating WhatsApp** FAB → opens the brand's real WhatsApp number in a new tab.

## Known cuts / placeholders

- Sponsor "logos" are typeset text — drop the real SVGs into `ui_kits/web/assets/` and swap in `<Sponsors>` when you have them.
- All photography is hot-linked from `centrodeportivoaf.com`. For offline / self-hosted distribution, mirror per `assets/README.md`.
- Brand sport icons are minimal SVG rebuilds of the DESIGN.md stencils — the brand's original vector files (if any) will be drop-in compatible.
