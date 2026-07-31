# Handoff: Kombat logo & app icon

## Overview
Final identity for **Kombat** (casual games + crypto staking): a single geometric K
monogram — the "Ribbon" mark — plus the lowercase `kombat` lockup, the iOS/Android app
icon and the favicon. Approved direction = option **3b (Ribbon)** in the design file.

## About the design files
`Kombat Logo.dc.html` in this bundle is a **design reference created in HTML** — it shows
every variant at real size on the product's dark ground. It is not production code. The
production artefacts are the SVGs in `assets/`: use those directly (they are final, tiny,
and resolution-independent) and recreate any surrounding layout with the codebase's own
patterns.

## Fidelity
**High-fidelity.** Geometry, colors and sizes below are final. Do not redraw the mark by
hand or approximate the path — always ship the supplied path data.

## The mark — exact geometry
One closed contour on a 50 × 56 grid, 45° and 90° angles only:

```
viewBox="0 0 50 56"
d="M0 2 H13 V21 L34 0 H50 V14 H34 L20 28 L34 42 H50 V56 H34 L13 35 V54 H0 Z"
```

Rules:
- Never stroke, skew, rotate, outline, add gradients or add a drop shadow to the mark.
- Never re-space the parts: the stem, arms and folds are one path on purpose.
- Clear space on all sides = the stem width (13 units = 26% of the mark's width).
- Minimum sizes: **16px** tall for the bare mark, **96px** wide for the lockup.
- Scale by height, never non-uniformly.

## Color tokens
| Token | Hex | Use |
| --- | --- | --- |
| `lime` | `#c4f04a` | the mark, and interface lines/borders |
| `lime-pressed` | `#8fb52c` | pressed states, hairline borders on lime elements |
| `icon-ground` | `#101120` | app-icon and favicon ground only |
| `app-ground` | `#161826` | product background |
| `text` | `#e9e9ed` | wordmark and body text |

Placement rule: lime is a mark and a line, never a large flood — at most one saturated
lime field per screen. On a lime field the mark switches to `#101120`.
**If the shipped app already uses a different lime, replace `#c4f04a` everywhere with that
hex — it is the only value that needs changing.**

## Wordmark
- Family **Space Grotesk**, weight **700 (Bold)**, always lowercase `kombat`,
  letter-spacing **-0.045em**. Load from Google Fonts
  (https://fonts.google.com/specimen/Space+Grotesk) or self-host the variable font.
- Lockup: mark on the left, wordmark cap-height ≈ 0.72 × mark height,
  gap between them = 0.25 × mark height. Ready-made:
  `assets/kombat-lockup-on-dark.svg` and `assets/kombat-lockup-on-lime.svg`.
- A stacked lockup (mark centred above the wordmark, gap = 0.3 × mark height) is allowed
  for square spaces such as splash screens.
- Never all-caps, never italic, never heavier than 700, no tagline inside the lockup.
- The lockup SVGs carry live `<text>` — Space Grotesk must be available, or convert the
  text to outlines before shipping to contexts without webfonts (email, OG images).
- **Space Grotesk Bold is also the product's display face** — headings and buttons; Inter (or
  the existing UI font) stays for body copy and data.

## Assets in this bundle
| File | Use |
| --- | --- |
| `assets/kombat-mark-lime.svg` | primary mark |
| `assets/kombat-mark-dark.svg` | mark on lime or any light ground |
| `assets/kombat-mark-light.svg` | mark where lime is unavailable (print, 1-color) |
| `assets/kombat-mark-currentcolor.svg` | inline-SVG version that inherits CSS `color` |
| `assets/app-icon-ios-1024.svg` | iOS icon master — square, no rounded corners (iOS masks it), mark = 56% of canvas height |
| `assets/app-icon-maskable-1024.svg` | Android adaptive / PWA maskable — mark = 45% of canvas height, inside the safe circle |
| `assets/favicon.svg` | 32px favicon with its own rounded tile |
| `assets/kombat-lockup-on-dark.svg` | mark + wordmark, for dark grounds |
| `assets/kombat-lockup-on-lime.svg` | mark + wordmark on a lime field |

## What to update in the codebase
1. Replace the app icon everywhere it is declared:
   - iOS: `AppIcon.appiconset` — rasterise `app-icon-ios-1024.svg` to 1024, 180, 167, 152,
     120, 87, 80, 76, 60, 58, 40, 29, 20 px (PNG, no alpha, no pre-rounded corners).
   - Android: `ic_launcher` — foreground from `app-icon-maskable-1024.svg`, background
     solid `#101120`; regenerate mipmap densities.
   - Web/PWA: `favicon.svg`, `favicon.ico` (32/16), `apple-touch-icon.png` (180),
     `icon-192.png`, `icon-512.png` (maskable), and the `manifest.json` `icons` entries.
2. Replace every in-app logo instance (nav brand, splash, empty states, auth screens,
   loading screen, emails, OG/social image) with the mark or lockup SVG — delete the old
   asset files rather than leaving both.
3. Set `theme_color` / `background_color` in `manifest.json` to `#161826`, and the iOS
   launch-screen background to `#161826` with the mark centred at 24% of screen width.
4. Add the tokens above to the existing token/theme file — do not hard-code hexes in
   components.
5. If a monochrome variant is needed (watch app, iOS tinted icon, print), use
   `kombat-mark-light.svg` on dark or `kombat-mark-dark.svg` on light. Never recolor the
   mark to anything outside these four values.

## Assets that came from elsewhere
None — the mark is drawn from scratch; only the Space Grotesk typeface is external
(https://fonts.google.com/specimen/Space+Grotesk, weight 700).

## Files
- `Kombat Logo.dc.html` — the design reference (open in a browser; option 3b is the approved mark)
- `assets/*.svg` — production artefacts
- `prompt.md` — a paste-ready instruction for Claude Code
