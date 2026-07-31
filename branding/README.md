# Branding

The Kombat identity: the "Ribbon" K mark, the `kombat` lockup, and the app
icons generated from them. `HANDOFF.md` is the designer's brief and is the
authority on geometry, clear space and usage rules - read it before changing
anything here. `design-reference.html` shows every variant at real size.

## The one rule that matters

The mark is a single path on a 50 x 56 grid:

```
M0 2 H13 V21 L34 0 H50 V14 H34 L20 28 L34 42 H50 V56 H34 L13 35 V54 H0 Z
```

Never redraw it, stroke it, rotate it, or scale it non-uniformly. Components
that render it (`apps/web/src/components/Logo.tsx`,
`apps/mobile/src/components/LogoMark.tsx`) hold that path and nothing else.

## Lime

The handoff ships `#c4f04a`, and says to use the product's existing lime if it
already has one. It does - `#8ee05a` (`colors.accent` in mobile, `--green` in
web) - so every asset here is recolored to it. That is the only intentional
deviation from the brief.

## Files

| File | Use |
| --- | --- |
| `assets/kombat-mark-lime.svg` | primary mark |
| `assets/kombat-mark-dark.svg` | mark on lime or any light ground |
| `assets/kombat-mark-light.svg` | one-colour contexts (print) |
| `assets/kombat-mark-currentcolor.svg` | inline SVG that inherits CSS `color` |
| `assets/kombat-lockup-on-dark.svg` | mark + wordmark for dark grounds |
| `assets/kombat-lockup-on-lime.svg` | mark + wordmark on a lime field |
| `assets/app-icon-ios-1024.svg` | iOS icon master (square, unrounded) |
| `assets/app-icon-maskable-1024.svg` | Android adaptive / PWA maskable master |
| `assets/favicon.svg` | 32px favicon with its own rounded tile |
| `exports/favicon-32.png` | raster fallback for contexts without SVG |

The lockups carry live `<text>` in Space Grotesk Bold. Convert to outlines
before using them where webfonts are unavailable (email, OG images).

## Where the assets are wired up

- iOS: `apps/mobile/ios/GamingPlatform/Images.xcassets/AppIcon.appiconset`
- Android: `apps/mobile/android/app/src/main/res/mipmap-*`
- Web icons: `apps/web/src/app/icon.svg`, `apps/web/src/app/apple-icon.png`,
  `apps/web/public/icon-192.png`, `apps/web/public/icon-512.png`
- In-product marks: the two components listed above

## Regenerating the rasters

The PNGs are rendered from the SVG masters with headless Chromium at exact
pixel sizes - iOS icons flattened (no alpha, as the App Store requires),
Android round icons clipped to a circle. Re-run whenever a master changes.
