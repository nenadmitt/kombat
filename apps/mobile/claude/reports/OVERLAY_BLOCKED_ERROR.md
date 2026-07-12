# Report: the "overlay blocked" error (frozen, touch-dead app)

## Summary

An "overlay blocked" error is when the app renders normally but stops responding
to any touch, because two native React Native `Modal`s were presented or
animated in the same tick and iOS wedged its modal presentation stack. The
topmost (usually transparent) modal then captures every touch and never releases
it. This report explains the symptom, the root cause, the concrete instance we
hit (the staked-game joiner freeze), and the rules that prevent it.

## Symptom

- The screen looks completely normal and keeps rendering/animating.
- Nothing is tappable: buttons, inputs, in-screen back buttons, and even the
  hardware back button all do nothing.
- It is not a crash (no red screen, no error dialog).
- It usually **persists across navigation**, so it follows the user from one
  screen into the next.

In our case: the player who **joined** a staked match had a dead, unresponsive
phone from ship placement all the way through to the Winner screen. The room
**creator** was unaffected, and **free** games were unaffected.

## Root cause: two native Modals at once

React Native's `Modal` maps to a real platform modal presentation. iOS wedges
its modal presentation stack if you present a Modal while another Modal is still
presenting or animating (in or out). When that happens, the topmost modal (or
its transparent backdrop) keeps capturing all touch events and never hands them
back. Because the top modal is often `transparent`, the screen underneath is
still visible, which is why it looks fine but is "dead."

The trigger is always the same shape: **two Modals mounted or transitioning in
the same tick.** Common ways it appears:

1. Two components each render their own `<Modal visible>` and both become visible
   at once.
2. One component returns a *different* `<Modal>` based on state, so a state
   change swaps Modal A for Modal B instead of swapping their contents.
3. Code does `await confirm(...)` (a Modal) then immediately presents another
   Modal before the first has finished animating away.
4. A Modal is dismissed and navigation pushes a new screen in the same tick, so
   the transparent Modal is still animating out over the new screen.

## The concrete instance: staked-game joiner freeze

`WaitingForPlayersPopup` had this gate:

```tsx
if (isSecuringStakes) {
  return <StakeFundingOverlay visible ... />; // a Modal
}
```

`isSecuringStakes` is turned on by the `stake:funding` socket event, which the
server sends to **both** players (`StakesService.notifyPlayers` -> both
`room.userId` and `room.opponentId`). So on the **joiner**:

- `GameLobyScreen` already presents its own funding overlay `Modal`
  (`fundingRoom` is set the moment they join a staked room), **and**
- `WaitingForPlayersPopup` **also** mounted `StakeFundingOverlay` (a second
  `Modal`) because `isSecuringStakes` was true.

Two Modals racing to present -> iOS presentation stack wedged -> dead touches
that persisted into the match and the Winner screen.

Why only the joiner: the popup was originally gated `visible = waitingRoom !== null`
(creator-only; only the creator holds a `waitingRoom`). The `if (isSecuringStakes)`
gate dropped that condition, so it fired for the joiner too (who has
`isSecuringStakes === true` but `waitingRoom === null`). The creator only ever
had one funding modal, so it never wedged.

Why only staked games: free games set neither `fundingRoom` nor
`isSecuringStakes` and go straight to `enterMatch` with no funding modal at all.

## The fixes applied

1. **Never mount two funding modals.** `WaitingForPlayersPopup` is creator-only
   for the securing state again (`isSecuringStakes && waitingRoom !== null`) and
   swaps **content inside its single Modal** instead of returning a different
   Modal. `StakeFundingOverlay` was split into `StakeFundingCard` (chrome-less,
   used inside an existing Modal) and `StakeFundingOverlay` (its own Modal, for
   the lobby only), so the two never coexist.
2. **Serialize confirm dismissal.** `useConfirm()` resolves only after the sheet
   is fully off-screen (iOS `Modal.onDismiss` plus a ~450ms fallback), so a
   caller can safely present another modal after `await confirm(...)`.
   `BottomSheet` gained an `onDismissed` prop.
3. **Serialize funded -> navigate.** On `stake:funded`, the lobby dismisses the
   funding overlay first and navigates ~350ms later, once it has faded out.
4. **Delay failure notices.** On `stake:failed`, the notice sheet is presented
   ~500ms after the overlay/popup is torn down, in both the joiner and creator
   paths.

## Rules to prevent recurrence

1. Never present or swap two Modals in the same tick. For a surface with two
   visual states, keep one `<Modal>` and swap its **children**, never return a
   different Modal.
2. Only one owner may show a funding/overlay Modal at a time. Gate each overlay
   so exactly one screen presents it.
3. Wait for a Modal to finish dismissing before presenting the next: use the
   dismissal signal (`Modal.onDismiss` / `BottomSheet.onDismissed`, or the
   already-serialized `useConfirm()`), or add a ~350 to 500ms delay when there
   is no callback (dismiss then navigate, or notice after a socket event).
4. Prefer `useConfirm()` over `Alert` and over hand-rolled Modals. It is a
   single, app-wide Modal that already serializes correctly.

## Debugging checklist

- Did two `<Modal>`s become `visible` at once? Search the mounted tree for every
  Modal (including `BottomSheet` / `ConfirmSheet` / overlays) and confirm their
  `visible` conditions can never overlap.
- Is some state swapping one Modal for another instead of swapping children?
- Is a Modal being presented right after another is dismissed (confirm then
  overlay, or dismiss then navigate) without waiting for the dismissal?

If any answer is yes, that is the overlay-blocked error.

## Related

See `apps/mobile/claude/BUGFIX_JOINER_FREEZE.md` for the change-by-change fix log
of the staked-game instance.
