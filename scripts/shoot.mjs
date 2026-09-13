/**
 * Screenshots every screen and fails on any console error.
 *
 * Runs against the production build, so what is captured is what deploys.
 *
 *   npm run build && npm run preview
 *   node scripts/shoot.mjs [baseUrl] [outDir]
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";

const base = process.argv[2] ?? "http://localhost:4173";
const outDir = process.argv[3] ?? "docs/screens";
await mkdir(outDir, { recursive: true });

// The container ships a Chromium that may not match this Playwright's expected
// revision, so point at it explicitly rather than downloading another copy.
const executablePath = process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium";
const browser = await chromium.launch(
  existsSync(executablePath) ? { executablePath } : {},
);

const page = await browser.newPage({
  viewport: { width: 1440, height: 980 },
  deviceScaleFactor: 2,
});

const problems = [];
page.on("console", (message) => {
  if (message.type() === "error") problems.push(`console: ${message.text()}`);
});
page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));

const shot = async (name, full = true) => {
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${outDir}/${name}.png`, fullPage: full });
  console.log(`  ${name}`);
};

// Nav buttons carry their alert count in the accessible name, so this
// matches on the prefix rather than the exact string.
const nav = async (label) => {
  await page.getByRole("button", { name: new RegExp(`^${label}`) }).first().click();
  await page.waitForTimeout(300);
};

await page.goto(base, { waitUntil: "networkidle" });
await shot("01-overview");

await nav("Catalog");
await shot("02-catalog");

// Open the drawer on the first product row, then expand the derivation so the
// captured panel shows both the decision and the working behind it.
await page.locator("tbody tr button").first().click();
await page.waitForTimeout(400);
const working = page.getByRole("button", { name: /Show the working/ });
if (await working.count()) {
  await working.click();
  await page.waitForTimeout(300);
}
await shot("03-product-drawer", false);
await page.keyboard.press("Escape");
await page.waitForTimeout(250);

await nav("Inventory");
await shot("04-inventory");

await nav("Vendors");
await shot("05-vendors");

await nav("Promotions");
await shot("06-promotions");

await nav("Ask");
await shot("07-ask-empty");
await page.getByRole("button", { name: "What should I reorder this week?" }).click();
await page.waitForTimeout(400);
await shot("08-ask-answer");

// The unmatched path matters as much as the matched one.
await page.getByPlaceholder("What should I reorder this week?").fill("how is the vibe");
await page.getByRole("button", { name: /^Run$/ }).click();
await page.waitForTimeout(350);
await shot("09-ask-unmatched");

await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(300);
await nav("Overview");
await shot("10-mobile-overview");

await browser.close();

if (problems.length > 0) {
  console.error(`\n${problems.length} console problem(s):`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
console.log("\nNo console errors.");
