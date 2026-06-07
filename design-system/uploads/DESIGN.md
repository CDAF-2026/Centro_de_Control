---
name: Impact Lime Athletic System
colors:
  surface: '#f9f9f9'
  surface-dim: '#dadada'
  surface-bright: '#f9f9f9'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f3f4'
  surface-container: '#eeeeee'
  surface-container-high: '#e8e8e8'
  surface-container-highest: '#e2e2e2'
  on-surface: '#1a1c1c'
  on-surface-variant: '#474836'
  inverse-surface: '#2f3131'
  inverse-on-surface: '#f0f1f1'
  outline: '#787864'
  outline-variant: '#c8c8b1'
  surface-tint: '#5b6300'
  primary: '#5b6300'
  on-primary: '#ffffff'
  primary-container: '#d4e157'
  on-primary-container: '#5b6300'
  inverse-primary: '#c2cf47'
  secondary: '#506169'
  on-secondary: '#ffffff'
  secondary-container: '#d1e2ec'
  on-secondary-container: '#55656d'
  tertiary: '#3e6280'
  on-tertiary: '#ffffff'
  tertiary-container: '#b8dcff'
  on-tertiary-container: '#3e617f'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dfec60'
  primary-fixed-dim: '#c2cf47'
  on-primary-fixed: '#1a1d00'
  on-primary-fixed-variant: '#444b00'
  secondary-fixed: '#d4e5ef'
  secondary-fixed-dim: '#b8c9d3'
  on-secondary-fixed: '#0d1e25'
  on-secondary-fixed-variant: '#394951'
  tertiary-fixed: '#cce5ff'
  tertiary-fixed-dim: '#a7caed'
  on-tertiary-fixed: '#001d31'
  on-tertiary-fixed-variant: '#254a67'
  background: '#f9f9f9'
  on-background: '#1a1c1c'
  surface-variant: '#e2e2e2'
  impact-lime: '#D4E157'
  court-charcoal: '#37474F'
  stadium-black: '#1A1C1E'
  surface-gray: '#F5F7F8'
typography:
  display-lg:
    fontFamily: Montserrat
    fontSize: 48px
    fontWeight: '900'
    lineHeight: 52px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Montserrat
    fontSize: 32px
    fontWeight: '800'
    lineHeight: 40px
  headline-md:
    fontFamily: Montserrat
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  headline-sm:
    fontFamily: Montserrat
    fontSize: 20px
    fontWeight: '700'
    lineHeight: 28px
  body-lg:
    fontFamily: Open Sans
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Open Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-lg:
    fontFamily: Open Sans
    fontSize: 14px
    fontWeight: '700'
    lineHeight: 20px
  label-sm:
    fontFamily: Open Sans
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
  display-lg-mobile:
    fontFamily: Montserrat
    fontSize: 36px
    fontWeight: '900'
    lineHeight: 40px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 8px
  container-max: 1280px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 40px
---

## Brand & Style

The design system is engineered to evoke high-velocity movement, professional precision, and the premium nature of elite sports facilities. It serves athletes and club members who value performance and a modern aesthetic.

The style is a fusion of **Corporate Modern** and **High-Contrast Bold**. It utilizes heavy typographic weights, slanted (italic) display faces to suggest forward motion, and a technical grid-based architecture. Visual elements are crisp and purposeful, avoiding unnecessary decorative clutter to maintain a "performance-first" atmosphere. The aesthetic is anchored by the tension between the vibrant, high-visibility lime and the grounded, industrial charcoal.

## Colors

The palette is dominated by **Impact Lime**, used strategically to draw focus to primary actions and key brand moments. **Court Charcoal** provides a sophisticated, professional counterweight, used for text, heavy UI elements, and high-contrast backgrounds.

- **Primary (Impact Lime):** Use for primary buttons, active states, and critical iconography. It represents the ball, the energy, and the action.
- **Secondary (Court Charcoal):** Use for headers, dark-themed sections, and structural elements. It provides the "premium" foundation.
- **Neutral:** A range from pure white for clean surfaces to a soft surface-gray for subtle grouping.
- **Accessibility Note:** When placing white text on Impact Lime, ensure it is restricted to large display sizes or use Court Charcoal text for smaller components to maintain legibility.

## Typography

Typography is the primary driver of the athletic narrative. **Montserrat** is used exclusively for headings and display text, predominantly in heavy weights (ExtraBold/Black) and frequently italicized to reinforce the "speed" aesthetic.

**Open Sans** handles all functional and body copy. It provides a clean, neutral balance to the aggressive headings, ensuring that schedules, rules, and descriptions remain highly readable even at small sizes.

- **Headlines:** Should use uppercase for Impact Lime or Court Charcoal treatments to maximize presence.
- **Motion:** Italicization is reserved for brand-level messaging and primary section headers.
- **Hierarchy:** Use the heavy uppercase labels for navigation and metadata to maintain the technical, organized feel.

## Elevation & Depth

Visual hierarchy is achieved through **Tonal Layers** and **Low-Contrast Outlines** rather than traditional heavy shadows.

- **Layering:** Backgrounds should alternate between Stadium Black (for impact) and Surface Gray (for information density).
- **Shadows:** When used, shadows must be extremely subtle (low opacity, high blur) to avoid a "heavy" look. The preference is to use 1px Court Charcoal borders for depth.
- **Interaction Depth:** Hover states on cards should involve a slight upward translation (e.g., -4px) and a color shift in the border or an increase in the Impact Lime saturation, rather than a deepening of shadows.

## Shapes

The shape language is **Soft (0.25rem)**. This subtle rounding suggests precision and industrial design while being more approachable than sharp 90-degree corners.

- **Standard Elements:** Buttons, input fields, and small cards use the base `rounded` (4px) setting.
- **Large Components:** Images and prominent section containers may use `rounded-lg` (8px) to soften high-contrast transitions.
- **Circular Elements:** Icons and profile avatars should remain fully circular (pill/circle) to contrast against the geometric grid.

## Components

### Buttons
- **Primary:** Impact Lime background with Court Charcoal text. Bold, uppercase Montserrat.
- **Secondary/Outline:** Transparent background with a 2px Impact Lime or Court Charcoal border.
- **Ghost:** Text-only with an arrow icon (e.g., "VER MÁS ↗"), using a color shift on hover.

### Cards
- **Athletic Cards:** Use a dark Court Charcoal background for "Trainer" or "Class" cards. Feature the title in white italic Montserrat. Primary actions within cards should be Impact Lime.
- **Status Chips:** Small, rounded-sm badges in Impact Lime (for active) or Light Gray (for full/inactive).

### Inputs & Selection
- **Inputs:** Clean, 1px Court Charcoal borders. Label text should be Open Sans Bold, uppercase, and small.
- **Checkboxes/Radios:** Square with 2px roundedness, using Impact Lime for the active state to ensure visibility.

### Navigation
- **Top Bar:** Fixed, using a semi-transparent white or Court Charcoal backdrop. Use vertical separators between links to mimic technical data displays.