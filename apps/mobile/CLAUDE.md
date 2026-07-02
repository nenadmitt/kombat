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
