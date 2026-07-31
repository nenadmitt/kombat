# apps/mobile — conventions

## 00. **THE DEFAULT IS NO COMMENT. DO NOT NARRATE YOUR WORK.**

See the Comments section in the root `CLAUDE.md`. It applies here and it is the
most repeated piece of feedback in this repo. **Never write a comment that
justifies your change to a reviewer, and never leave a paragraph-long docstring
explaining your reasoning** - that belongs in the commit message. One short
"why" line on a genuinely tricky seam, or nothing.

## 0. **ALWAYS USE THE SPACING SCALE. ALWAYS VERIFY IT.**

# **NO RAW PIXEL NUMBERS FOR SPACING. EVER.**

Every `padding*`, `margin*`, and `gap` **MUST** be a token from `spacing` in
`src/theme/colors.ts`, and every `borderRadius` **MUST** be a token from
`radius`. There is no such thing as "close enough": `7`, `9`, `11`, `13`, `44`
are all **WRONG**, even when a design file says so.

```
spacing   xxs 4   xs 8   sm 12   md 16   lg 24   xl 32   xxl 48
radius    sm 12   md 16   lg 20   xl 28   pill 100
```

**When a design gives odd values, round to the nearest token.** Designs are
drawn at arbitrary pixel values; this app is built on a scale. Translating the
design means mapping onto the scale, not transcribing numbers out of it.

**Rules that keep being broken:**

- **One block gap per screen.** `Screen` already puts `spacing.md` between
  every top-level block. **NEVER** add `paddingTop`/`marginTop` on top of it -
  that silently makes one gap 24 where every other is 16, and it is instantly
  visible.
- **Equal inset on all four sides.** If a card pads `spacing.md` horizontally,
  it pads `spacing.md` vertically. **NEVER** set only `paddingVertical` on a
  component whose horizontal padding comes from `Card`.
- **Sibling elements get identical spacing.** Cards in a row, rows in a list,
  icons in a tile - same value, from the same token, every time.
- **Repeated fixed sizes get a named constant** (`const ICON_TILE = 40`), not
  the number typed in three places at three different values (34/40/42).

**VERIFY BEFORE SAYING IT IS DONE.** Not by eye, and not by "it typechecks":

```bash
# Must return NOTHING for any file you touched.
grep -nE "(padding|margin|gap)[A-Za-z]*: *[0-9]" src/path/to/File.tsx
grep -nE "borderRadius: *[0-9]" src/path/to/File.tsx
```

Then screenshot the screen and check the gaps actually match. A spacing bug
always ships if it is only checked by reading the diff.

1. **Design tasks**: use the Figma MCP tools to look up the actual design
   reference before implementing a screen or component. Always reuse the
   existing color tokens in `src/theme/colors.ts` — don't introduce new
   hardcoded colors when an existing token already fits (add a new token
   there if genuinely needed, don't inline hex/rgba values in screens).

2. **Icons**: never use emoji as icons. Always use the shared `Icon` component
   at `src/components/Icon.tsx` (`<Icon type="user" />`) instead of importing
   from the icon package directly. The set is Hugeicons stroke-rounded
   (`@hugeicons/core-free-icons` + `@hugeicons/react-native`); duotone-rounded
   is a Pro style and needs a licence, so `Icon.tsx` is the one file that would
   change to adopt it. If a screen needs an icon that isn't in `Icon.tsx`'s
   `ICONS` map yet, add it there (import the Hugeicons icon and register a new
   `type` name) rather than importing the icon component directly in the screen.

3. **No em-dashes, ever**: never use the em-dash character (`-`, U+2014) in any
   file - code, comments, JSDoc, UI copy, docs, commit messages, anything. Use a
   regular hyphen (`-`), or restructure the sentence. This applies to every file
   in the repo, not just this app. Do not reintroduce em-dashes when editing
   existing lines.

4. **Confirmations**: never use the OS `Alert` from `react-native` for
   confirmations or notices. Use the shared bottom-sheet confirm via
   `const confirm = useConfirm()` (from `src/components/ui`) and
   `await confirm({ title, message, ... })`. It returns `true`/`false`; pass
   `mode: 'info'` for a single-button notice.

5. **Never overlap two native `Modal`s** - this is the single worst bug class
   in this app. A React Native `Modal` is a real platform presentation, and
   iOS wedges its presentation stack if one is presented while another is
   still presenting or animating out. The app keeps rendering but swallows
   every touch, and the wedge **follows the user across navigation** - through
   a whole match and into the result screen. It has bitten us four times
   (staked joiner, resume modal, multi-seat joiner, create-room). Read
   `claude/reports/OVERLAY_BLOCKED_ERROR.md` before touching any overlay.

   The rules:

   - One surface with two visual states keeps **one** `<Modal>` and swaps its
     children. Never return a different `Modal` from a state branch.
   - Only one owner may present a given overlay. Gate each so their `visible`
     conditions can never overlap.
   - Dismiss fully **before** presenting the next Modal or pushing a screen.
     Prefer a real dismissal signal (`Modal.onDismiss`,
     `BottomSheet.onDismissed`, or `useConfirm()` which already resolves only
     once its sheet is off screen). When the trigger is a socket event or an
     `await` with no callback to hang off, dismiss first and defer the next
     step by `MODAL_DISMISS_MS` (from `src/components/ui`).
   - Order matters: dismiss A, *then* present B. Presenting B first is the
     worst case, because A is still fully up.

   Anything a game screen renders over itself (Chroma's colour picker, a
   result overlay) must be an **in-screen absolutely-positioned View**, not a
   second `Modal`.

6. **Never swallow an error that gates a whole screen.** A `catch {}` around a
   fetch whose result flips a `loaded` boolean turns any transient failure
   into a permanent spinner - the screen renders its loading branch forever
   and the user has to kill the app. If a catch comment claims "something else
   will retry", point at that code or write the retry. Multiplayer engines use
   `games/use-match-sync-retry.ts` for exactly this. See
   `claude/reports/MATCH_START_STUCK_LOADING.md`.

7. **Every blocking screen needs a way out.** A loading or waiting screen
   must always render an exit, and must say why it is stuck when it knows.
   Use `games/MatchLoading.tsx` for match snapshots - it does both. A screen
   the user can reach but not leave is a bug no matter what put them there.
