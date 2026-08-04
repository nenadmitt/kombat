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

## 2026-08-04 - A wallet whose key is on another device cannot be recovered

- **Where:** `src/screens/OnboardingScreen.tsx` (reveals a mnemonic, never
  accepts one).
- **Why it's wrong:** the server stores only the address, so the device that
  created a wallet holds the only copy of its key. `ensureWallet` now detects
  this and stops with an explanation instead of reporting `ready`, but the
  user's only route back to their funds is to sign in on the original device.
  A second device, an Android reinstall or an erased simulator leaves the
  balance visible and permanently unspendable.
- **Suggested fix:** an import flow that accepts a mnemonic, derives the key,
  checks it against the address the server holds for the account, and writes
  it to this device's slot.

## 2026-08-04 - Raw pixel spacing left in WithdrawModal

- **Where:** `src/components/wallet/WithdrawModal.tsx` lines 448, 453, 458,
  479, 549 (`padding`/`gap`/`paddingVertical` of 0, 6, 7, 10) and 554
  (`borderRadius: 8`).
- **Why it's wrong:** the spacing scale is mandatory; 6, 7 and 10 are not
  tokens and `borderRadius: 8` is below `radius.sm`. Pre-existing, found by
  the required grep while editing this file for the error row.
- **Suggested fix:** map onto `spacing.xxs`/`spacing.xs` and `radius.sm`,
  then screenshot the sheet, since each change shifts rendered pixels.

## 2026-08-04 - Withdraw presents TransactionModal in the same tick it dismisses WithdrawModal

- **Where:** `src/screens/WalletScreen.tsx` onSubmitted (~line 297):
  `setOpenModal(null)` then `setActiveTxHash(hash)` synchronously.
- **Why it's wrong:** two native Modals overlap mid-animation, the exact iOS
  presentation wedge rule 5 bans; DepositModal's QR handoff right above it
  documents and uses the 350ms delay for this.
- **Suggested fix:** defer `setActiveTxHash(submitted.hash)` by
  `MODAL_DISMISS_MS` as the deposit path does.

## 2026-08-04 - Keychain slots are keyed by a userId that is not stable

- **Where:** `src/wallet/wallet-keychain.ts` (`serviceFor`), with
  `apps/server/src/admin/admin.service.ts` hard-deleting users and wallets.
- **Why it's wrong:** delete + re-register gives the same person a new UUID.
  The key survives on the device under the old UUID's slot, but
  `getWalletSecret` reads only the current UUID and `adoptLegacySecret`
  checks only the pre-migration un-keyed slot, so the app reports "key not
  found" on the very device that created the wallet and then mints a fresh
  one, orphaning the funded address on both the device and the server.
- **Suggested fix:** on the no-key path, enumerate
  `getAllGenericPasswordServices()` for the wallet prefix, derive each key's
  address, and surface orphaned wallets for sweeping or re-linking;
  possession of the key is ownership, the server row no longer exists to
  check against.
