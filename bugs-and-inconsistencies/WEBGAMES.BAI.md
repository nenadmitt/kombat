# apps/webgames — bugs and inconsistencies

Entry format: date, one-line summary, location, why it's wrong, suggested
fix. Remove an entry in the same change that fixes it.

## 2026-08-12 - Practice-mode capture count double-counts under StrictMode

- **Where**: `apps/webgames/src/games/ludo/useDemoLudo.ts` - `setMyCaptures`
  is called from inside the `setState` updaters `applyTokenMove` and
  `applyAbilityAction`.
- **Why it's wrong**: `main.tsx` renders under `<StrictMode>`, which
  double-invokes state updaters in development, so every capture in the Ludo
  practice match adds two to the result screen's CAPTURES stat. The updater
  is also impure, which is what makes the double invocation visible.
- **Suggested fix**: move the counter into `DemoState` (increment it in the
  returned state) and read it from there, so the updater stays pure. The same
  pattern predates the ability work; the launcher path only copied it.

## 2026-08-12 - Countdown hardcodes its own colour, so no caller can tint it

- **Where**: `apps/webgames/src/games/battleship/Countdown.tsx:31-34` - the
  value span carries `style={{ color: seconds <= 5 ? 'var(--loss)' : 'var(--text)' }}`.
- **Why it's wrong**: an inline style beats every stylesheet rule, so a
  surface that wants its clock in its own accent cannot have one. The Ludo
  rail shipped `.ludo-roll-clock .bs-clock-value { color: var(--lime-bright) }`
  and it never once applied; the same trap is waiting for anyone who styles
  `.bs-clock-value` from a container. Only the red last-five-seconds state
  actually needs to come from the component.
- **Suggested fix**: keep the urgency state as a class (`.bs-clock-value.is-urgent`
  with `color: var(--loss)`) and drop the inline style, letting the default
  colour and any container override come from CSS.

## 2026-08-12 - The turn clock can show one second more than the turn allows

- **Where**: `apps/webgames/src/games/battleship/Countdown.tsx:14-21` - `now`
  is seeded at mount and only advances on a 250ms interval.
- **Why it's wrong**: `deadline` changes the instant a turn hands over, but
  `now` can still be up to 250ms stale, so `Math.ceil((deadline - now) / 1000)`
  briefly renders 31 for a 30-second turn (visible in the Ludo practice match
  on every handover). Every game that mounts a Countdown shares it.
- **Suggested fix**: reset `now` to `Date.now()` in the same effect that
  restarts the interval when `deadline` changes.
