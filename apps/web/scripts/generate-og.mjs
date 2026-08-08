// Renders og-image.html to public/og.png at 1200x630.
//   node apps/web/scripts/generate-og.mjs
// Needs a browser: `npm i -D playwright && npx playwright install chromium`.
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, "og-image.html");
const out = join(here, "..", "public", "og.png");

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error(
    "playwright is not installed - run `npm i -D playwright && npx playwright install chromium`",
  );
  process.exit(1);
}

const browser = await chromium.launch();
// 1200x630 exactly - the size the metadata declares, and already 2x the width
// a preview card is ever drawn at.
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto(pathToFileURL(source).href, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: out });
await browser.close();

console.log(`wrote ${out}`);
