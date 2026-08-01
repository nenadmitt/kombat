# Keyboard handling

Reported symptom: opening the keyboard covers the input you are typing into,
and there is no OK/Confirm control to close it again.

Both halves are real, they have separate causes, and they compound: the field
you cannot see is also the field you cannot dismiss.

## 1. Number pads have no return key

Four inputs use `keyboardType="decimal-pad"`:

| Input | File |
|---|---|
| Stake amount | `components/wallet/StakePotModal.tsx:232` |
| Withdraw amount | `components/wallet/WithdrawModal.tsx:232` |
| Room stake | `games/CreateGameRoomModal.tsx:267` |
| Stepper value | `components/ui/Stepper.tsx:76` |

On iOS `decimal-pad` renders a ten-key grid with **no return key at all**.
There is no control on that keyboard that dismisses it, which is exactly the
"no OK button" in the report.

The trap is that the code reads as though it were handled. `Stepper.tsx:80-81`
sets `returnKeyType="done"` and `submitBehavior="blurAndSubmit"`; both are
**silently inert** on a number pad, because they configure a key that is not
rendered. Anyone auditing this file would conclude it was already solved.

Android is not affected: its numeric keyboard is dismissed with the system back
button.

## 2. Sheets did not move out of the keyboard's way

Every affected input lives in a bottom-anchored surface:

| Surface | Container | Had avoidance |
|---|---|---|
| StakePotModal | `BottomSheet` | no |
| WithdrawModal | `BottomSheet` | no |
| JoinByCodeSheet | `BottomSheet` | no |
| CreateGameRoomModal | raw `Modal` | no |
| LoginScreen | own `KeyboardAvoidingView` | yes |
| OnboardingScreen | own `KeyboardAvoidingView` | yes |

`BottomSheet` pins its content with `justifyContent: 'flex-end'`, so the sheet
sits flush against the bottom edge - precisely where the keyboard opens. With no
`KeyboardAvoidingView`, the keyboard is drawn over the input rather than pushing
it up.

This is why the bug looks inconsistent in use: the two screens that were built
with their own avoidance behave correctly, and every sheet does not.

Android already sets `android:windowSoftInputMode="adjustResize"`
(`AndroidManifest.xml:19`), so the OS resizes the window and the sheet is pushed
up without any JS involvement. **This half of the bug is iOS-only.**

## 3. Dismissing meant losing the sheet

`BottomSheet.tsx:52` renders the dim overlay as a `Pressable` wired straight to
`onClose`. With the keyboard up, tapping outside the field does not dismiss the
keyboard - it closes the whole sheet. Combined with (1), a user on iOS had no
way to put a number pad away except by abandoning what they were entering.

## 4. Submit affordances are inconsistent across the app

Where a return key *does* exist, whether it does anything varies per screen:

| Input | `returnKeyType` | `onSubmitEditing` |
|---|---|---|
| Login email / code | `go` | yes |
| Join-by-code | `go` | yes |
| Onboarding username | none | no |
| Onboarding referral code | none | no |
| Withdraw recipient | none | no |

`LoginScreen` is the reference implementation - avoidance, `autoFocus`, and a
return key that submits. The onboarding and withdraw fields give the user a
return key that does nothing.

## What was changed

- **`components/ui/KeyboardDoneBar.tsx`** (new): an `InputAccessoryView` with a
  Done button, exported alongside `KEYBOARD_DONE_ID`. Renders `null` off iOS.
  This is the standard fix for a keyboard that has no return key of its own.
- **`BottomSheet`**: wrapped in `KeyboardAvoidingView` (`behavior="padding"` on
  iOS only, since Android resizes natively) and renders one `KeyboardDoneBar`.
  Covers StakePotModal, WithdrawModal and JoinByCodeSheet at once.
- **`CreateGameRoomModal`**: same treatment applied to its raw `Modal`.
- All four `decimal-pad` inputs now carry
  `inputAccessoryViewID={KEYBOARD_DONE_ID}`.

The existing `SafeAreaView` styling was left exactly as it was in both sheets -
`KeyboardAvoidingView` was added as a parent with `flex: 1` rather than by
restyling the safe-area view, to keep the layout change as small as possible.

## Not addressed

- **Item 3 stands.** Tapping the dim overlay still closes the sheet rather than
  dismissing the keyboard. The Done bar makes this survivable, but the overlay
  is still a destructive tap target while editing.
- **Item 4 stands.** The onboarding and withdraw-recipient fields still have no
  `returnKeyType`/`onSubmitEditing`. These are ordinary text inputs, so the
  keyboard is dismissable and the fault is only that the return key is dead.
- **Nothing here has been verified on a device.** The changes typecheck, and the
  reasoning above is read off the code and the platform behaviour of
  `InputAccessoryView` / `decimal-pad`. The report should not be treated as
  confirmation that the sheets now sit correctly above the keyboard on a real
  handset - that needs a run on iOS, ideally on a device with a home indicator
  so the bottom inset is exercised.
