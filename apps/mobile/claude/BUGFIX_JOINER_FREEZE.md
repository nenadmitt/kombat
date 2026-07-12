# Bugfix: joiner freezes on staked games (frozen, touch-dead app)

## Symptom
When two players play a **staked** match, the player who **joins** an existing
room has their phone lock up: cannot place ships, no button responds, even the
hardware/back button and the "Winner" screen back button do nothing. The room
**creator** is unaffected. **Free** games are unaffected. The app is not crashed
- it renders correctly but ignores all touches, and stays that way through the
whole match into the result screen.

## Root cause
Two native `Modal`s were being presented **at the same time** on the joiner,
and iOS wedges its modal presentation stack when a `Modal` is presented while
another is still presenting or animating. Once wedged, the top (transparent)
modal keeps swallowing every touch and never lets go - which is exactly why the
screen looks normal but nothing is tappable, and why it persists all the way to
the Winner screen.

Where the second modal came from: the staking loading overlay introduced in the
previous commit. `WaitingForPlayersPopup` had this gate:

```tsx
if (isSecuringStakes) {
  return <StakeFundingOverlay visible ... />;   // a Modal
}
```

`isSecuringStakes` is flipped on by the `stake:funding` socket event, which the
server sends to **both** players (`StakesService.notifyPlayers` -> both
`room.userId` and `room.opponentId`). So on the **joiner**:

- `GameLobyScreen` already presents its own funding overlay `Modal`
  (`fundingRoom` set the moment they join a staked room), **and**
- `WaitingForPlayersPopup` **also** mounted `StakeFundingOverlay` (a second
  `Modal`) because `isSecuringStakes` was true.

Two `Modal`s racing to present -> iOS presentation stack wedged -> dead touches.

Why only the joiner: the original popup was gated `visible = waitingRoom !== null`
(creator-only - only the creator holds a `waitingRoom`). The joiner never
showed this popup. The new `if (isSecuringStakes)` gate dropped that condition,
so it fired for the joiner too (who has `isSecuringStakes === true` but
`waitingRoom === null`). The creator only ever had **one** funding modal (the
popup's card; the creator never joins via the lobby, so no `fundingRoom`
overlay), so the creator never wedged.

Why only staked games: free games set neither `fundingRoom` nor
`isSecuringStakes`, and the free-join path goes straight to `enterMatch` with no
funding modal at all.

## Fixes

### 1. Core fix - never mount two funding modals (the actual freeze)
`WaitingForPlayersPopup` is again **creator-only** for the securing state, and
it swaps **content inside its single Modal** instead of returning a different
Modal:

```tsx
const showSecuring = isSecuringStakes && waitingRoom !== null; // creator only
const visible = (waitingRoom !== null && !isMinimized) || showSecuring;
// ...one <Modal>, content switches between the securing card and the waiting card
```

The joiner now sees exactly one funding modal - `GameLobyScreen`'s overlay. The
`StakeFundingOverlay` was split into `StakeFundingCard` (chrome-less, for use
inside an existing Modal) and `StakeFundingOverlay` (its own Modal, for the
lobby only), so the two never coexist.

### 2. Serialize confirm-sheet dismissal (defensive, related hazard)
`useConfirm()` now resolves its promise only **after** the sheet has fully
animated away (iOS `Modal.onDismiss`, with a 450 ms Android/safety fallback).
Callers routinely do `await confirm(...)` then immediately present another modal
(e.g. the join confirmation -> funding overlay); resolving mid-animation would
re-introduce the same overlap. `BottomSheet` gained an `onDismissed` prop for
this.

### 3. Serialize the funded -> navigate hand-off (defensive)
On `stake:funded`, the lobby now dismisses the funding overlay first and
navigates into the match **350 ms later**, once it has faded out. Pushing the
match screen while a transparent modal is still mid-dismiss is the same wedge in
a different disguise.

### 4. Delay failure notices behind overlay dismissal (defensive)
On `stake:failed`, the "Stakes could not be secured" confirm sheet is presented
500 ms after the funding overlay/popup is torn down, in both the joiner
(`GameLobyScreen`) and creator (`MainTabsWithGameOverlay`) paths.

## Files touched
- `src/games/WaitingForPlayersPopup.tsx` - creator-only securing gate; single Modal, content swap
- `src/components/ui/StakeFundingOverlay.tsx` - split into `StakeFundingCard` + `StakeFundingOverlay`
- `src/components/ui/ConfirmSheet.tsx` - resolve after full dismissal
- `src/components/ui/BottomSheet.tsx` - `onDismissed` passthrough to `Modal.onDismiss`
- `src/screens/GameLobyScreen.tsx` - funded delays navigation; failed delays notice
- `src/navigation/MainTabsWithGameOverlay.tsx` - failed delays notice
- `src/components/ui/index.ts` - export `StakeFundingCard`

## Guardrail for the future
Never present or swap two React Native `Modal`s in the same tick. Render extra
content **inside** the Modal that is already up (as `StakeFundingCard` now
does), or wait for the first Modal's dismissal to complete (via `onDismiss` /
`onDismissed`) before presenting the next.
