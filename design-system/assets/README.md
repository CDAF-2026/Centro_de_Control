# Assets — Centro Deportivo AF

The brand's real visual assets live on the live WordPress site at
`https://centrodeportivoaf.com/wp-content/uploads/...`. To keep the design
system lightweight, the preview cards and UI kit reference those URLs
directly. If you want offline / self-hosted copies, download from the URLs
listed below and drop the files into this folder, then update references.

## Logos
- `logo-primary.png` — full circular lockup with wordmark "Alejandro Falla · Centro Deportivo" wrapping a lime tennis ball + charcoal A monogram. 1080×1080, transparent corners. **Provided by the client.**
  - Use on light surfaces as-is (transparent PNG).
  - On dark surfaces: apply `border-radius: 50%` + `object-fit: cover` to crop the white square inside the circle. Optional 2px Impact-Lime ring (`box-shadow: 0 0 0 2px #D4E157`).

## Hero / category imagery
- `tenis-ninos.jpg` — kids on court
  → https://centrodeportivoaf.com/wp-content/uploads/2024/08/ninos.jpg
- `tenis-adultos.jpg` — adult tennis
  → https://centrodeportivoaf.com/wp-content/uploads/2024/08/adulto.jpg
- `padel.jpg`
  → https://centrodeportivoaf.com/wp-content/uploads/2024/07/padel.jpg
- `tenis-home.jpg`
  → https://centrodeportivoaf.com/wp-content/uploads/2024/01/tenis-home2.jpg
- `padel-home.jpg`
  → https://centrodeportivoaf.com/wp-content/uploads/2024/01/padel-home2.jpg

## Staff portraits (square, ~400×400 typical)
- `staff/alejandro-falla.jpg` → /wp-content/uploads/2023/12/alejandro-falla.jpg
- `staff/willington-ortiz.jpg` → /wp-content/uploads/2023/12/willington-ortiz.jpg
- `staff/leo-ruiz.jpg`         → /wp-content/uploads/2025/04/leo.jpg
- `staff/joaquin-della-mea.jpg`→ /wp-content/uploads/2025/01/joaquin.jpg
- `staff/jorge-perez.jpg`      → /wp-content/uploads/2023/12/Jorge-Perez.jpg
- `staff/carlos-salamanca.jpg` → /wp-content/uploads/2026/01/charlie2026.jpg
- `staff/marlon-marin.jpg`     → /wp-content/uploads/2025/09/marlon.jpg

## Brand values stencils (hero overlay banners)
- `respeto.jpg`     → /wp-content/uploads/2024/04/RESPETO.jpg
- `honestidad.jpg`  → (referenced as HONESTIDAD)
- `compromiso.jpg`  → (referenced as COMPROMISO)
- `disciplina.jpg`  → (referenced as disciplina)

## Gallery thumbnails
- `eventos.jpg`     → /wp-content/uploads/2025/01/EVENTOS.jpg
- `cff.jpg`         → /wp-content/uploads/2025/01/CFF.jpg
- `academia.jpg`    → /wp-content/uploads/2024/01/ACADEMIA-33.jpg

## Sponsor / partner logos
- Easycancha → https://www.easycancha.com/es-CO
- Fila Latin  → https://filalatin.com/
- Coordinadora → https://www.coordinadora.com/

## Iconography
The live site uses **Font Awesome** glyphs (calendar, location pin, clock,
chat). The DESIGN.md spec shows brand-styled circular icons: black tennis
ball, padel racket, clock, location pin, calendar — drawn with a 2px
Impact-Lime stroke on a black ball-shape.

For our UI kit we substitute **Lucide** (https://lucide.dev) loaded from CDN —
matching stroke weight and minimal geometric style. See `ICONOGRAPHY` in
README. The custom sport icons (tennis ball, padel racket) are recreated as
inline SVG in `ui_kits/web/icons/`.
