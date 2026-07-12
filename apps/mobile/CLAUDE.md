# apps/mobile — conventions

1. **Design tasks**: use the Figma MCP tools to look up the actual design
   reference before implementing a screen or component. Always reuse the
   existing color tokens in `src/theme/colors.ts` — don't introduce new
   hardcoded colors when an existing token already fits (add a new token
   there if genuinely needed, don't inline hex/rgba values in screens).

2. **Icons**: never use emoji as icons. Always use the shared `Icon` component
   at `src/components/Icon.tsx` (`<Icon type="user" />`) instead of importing
   from `lucide-react-native` directly. If a screen needs an icon that isn't
   in `Icon.tsx`'s `ICONS` map yet, add it there (import the `lucide-react-native`
   icon and register a new `type` name) rather than importing the icon
   component directly in the screen.

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
