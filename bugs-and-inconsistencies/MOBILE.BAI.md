# MOBILE - bugs and inconsistencies

Entry format: date, one-line summary, location, why it's wrong, suggested
fix. Remove an entry in the same change that fixes it.

## 2026-08-03 - Spacing/contrast token fixes still need a screenshot pass

- **Where:** `src/components/ui/Chip.tsx`, `AddressPill.tsx`,
  `BottomSheet.tsx`, `src/components/wallet/ChainSelector.tsx` (moved onto
  `spacing`/`radius` tokens) and `src/theme/colors.ts` (`textFaint`
  `#4a4b57` -> `#7c7d8a`).
- **Why it's flagged:** each change shifts rendered pixels app-wide (chips,
  pills, every bottom sheet, all placeholder text). The grep check passes;
  the visual check has not been run.
- **What to do:** screenshot the wallet tab, a bottom sheet, and a screen
  with input placeholders; confirm nothing regressed. `textFaint` now sits
  at ~4.3:1 on the app background but ~3.7:1 on `surface` - pushing it to a
  strict 4.5:1 everywhere would make it nearly identical to `textMuted`,
  which is a design call.
