---
name: cdaf-design
description: Use this skill to generate well-branded interfaces and assets for Centro Deportivo Alejandro Falla (CDAF) — a premium tennis & pádel club in Llanogrande, Colombia — either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping. The brand voice is "Impact Lime Athletic System": heavy italic Montserrat + Open Sans, Impact Lime (#D4E157) + Court Charcoal, uppercase headlines, lowercase category titles.
user-invocable: true
---

Read the README.md file within this skill, and explore the other available files.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

## Key files

- `README.md` — full brand bible: voice, visual foundations, iconography.
- `colors_and_type.css` — canonical CSS variables. Import this from any HTML/CSS you write.
- `ui_kits/web/` — React component recreation of the marketing site (TopBar, Hero, Cards, Modal, etc).
- `preview/` — single-purpose preview cards illustrating each token cluster.
- `assets/README.md` — URLs to the brand's real photography (live WP CDN).

## Quick-reference defaults

- Display font: **Montserrat** 900 italic UPPERCASE for hero / titles.
- Body font: **Open Sans** 400/700.
- Primary accent: `#D4E157` (Impact Lime) on `#1A1C1E` (Stadium Black) or `#37474F` (Court Charcoal).
- Default corner radius: **4px**. Avatars/icon badges: full circle.
- Hover signature: `translateY(-4px)` + border color swap to lime. No deepening shadows.
- Voice: Spanish-first, second-person plural ("ofrecemos"), uppercase for emphasis, **no emoji**.
- Buttons: always include the `↗` for ghost links. Always uppercase Montserrat in CTAs.
