# apps/web — bugs and inconsistencies

## 2026-08-01 — the referral card's copy icon is not a control

`apps/web/src/app/page.tsx:183` renders `<Copy />` inside `.referralCode` with
no handler, and `page.module.css` gave it `cursor: pointer`. It looked
clickable and did nothing. The cursor is removed as part of the design pass so
it no longer claims an affordance it lacks; the icon itself is still there.

Fix: make the code row a real `<button>` in a client component that writes to
`navigator.clipboard` and confirms, or drop the icon.

## 2026-08-01 — the referral card ships hardcoded placeholder numbers

`apps/web/src/app/page.tsx` renders `ARTHY_REF`, `14` players joined, `386`
matches, `$48.20` earned, and three fee-split bar widths (`12%`, `34%`, `54%`)
as literals. On a public landing page these read as real product data.

Fix: label the block as an example, or wire it to real values.
