#!/usr/bin/env tsx
/**
 * One-time setup: loads your Safari YouTube cookies into a Playwright browser,
 * navigates to YouTube Studio (no fresh Google login needed), and saves the session.
 * Run: npx tsx scripts/save-youtube-session.ts
 */
import { webkit } from "playwright";
import * as path from "node:path";
import * as fs from "node:fs/promises";

const COOKIES_FILE = path.join("company", "youtube-cookies.json");
const SESSION_FILE = path.join("company", "youtube-session.json");

async function main() {
  // Load existing Safari cookies — must have run extract-cookies.py first
  const cookiesRaw = await fs.readFile(COOKIES_FILE, "utf-8").catch(() => null);
  if (!cookiesRaw) {
    console.error("No youtube-cookies.json found — run: python3 scripts/extract-cookies.py first");
    process.exit(1);
  }

  const { cookies } = JSON.parse(cookiesRaw) as { cookies: object[] };
  console.log(`Loaded ${cookies.length} Safari YouTube cookies`);
  console.log("Opening browser and navigating to YouTube Studio...\n");

  const browser = await webkit.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Safari/605.1.15",
  });

  // Inject Safari cookies before navigating (avoids Google sign-in entirely)
  await context.addCookies(cookies as Parameters<typeof context.addCookies>[0]);

  const page = await context.newPage();

  // Go to youtube.com first to activate the auth cookies
  console.log("Step 1/3: Loading YouTube...");
  await page.goto("https://www.youtube.com/", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(3000);

  const ytUrl = page.url();
  if (ytUrl.includes("accounts.google.com") || ytUrl.includes("/signin")) {
    console.error("\nYouTube cookies are expired — re-run: python3 scripts/extract-cookies.py");
    console.error("(Make sure you are logged into YouTube in Safari first)");
    await browser.close();
    process.exit(1);
  }

  console.log("Step 2/3: Navigating to YouTube Studio...");
  await page.goto("https://studio.youtube.com/", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(6000);

  // If channel selector appears, click Mr Sab Pata
  await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll("yt-formatted-string, a, div"));
    const msp = items.find(el => /sab pata/i.test(el.textContent || ""));
    if (msp) (msp as HTMLElement).click();
  });
  await page.waitForTimeout(3000);

  const studioUrl = page.url();
  if (studioUrl.includes("accounts.google.com")) {
    console.error("\nYouTube Studio requires re-authentication.");
    console.error("Please log into studio.youtube.com in Safari, then re-run extract-cookies.py");
    await browser.close();
    process.exit(1);
  }

  console.log(`Step 3/3: Studio loaded (${page.url().slice(0, 70)}) — saving session...`);
  await page.waitForTimeout(2000);
  await context.storageState({ path: SESSION_FILE });

  const stat = await fs.stat(SESSION_FILE);
  console.log(`\n✅ Session saved → ${SESSION_FILE} (${stat.size} bytes)`);
  console.log("YouTube Shorts will now upload automatically.");

  await browser.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
