# Fonts

The brand uses two Google Fonts:

- **Montserrat** — display / headlines. Heavy weights (ExtraBold 800 / Black 900), frequently italic for the "speed" treatment.
- **Open Sans** — body and UI copy. Regular 400 / Semibold 600 / Bold 700.

Both load over the Google Fonts CDN in `colors_and_type.css`:

```css
@import url('https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,400;0,600;0,700;0,800;0,900;1,800;1,900&family=Open+Sans:wght@400;600;700&display=swap');
```

These are the same families used by the live site (`centrodeportivoaf.com`) — no substitution flagged.

If you need offline / self-hosted copies, download the `.woff2` files from <https://fonts.google.com/specimen/Montserrat> and <https://fonts.google.com/specimen/Open+Sans> and drop them in this folder, then swap the `@import` for a local `@font-face` block.
