#!/usr/bin/env tsx
/**
 * One-time setup: open a visible browser, log into TikTok.
 * Browser auto-closes once login is detected (up to 10 minutes).
 * Run: npx tsx --env-file=.env.local scripts/save-tiktok-session.ts
 */
import { webkit } from "playwright";
import * as path from "node:path";

const SESSION_FILE = path.join("company", "tiktok-session.json");

async function main() {
  console.log("=== TikTok One-Time Login ===");
  console.log("A browser window will open. Log into TikTok (any method).");
  console.log("The script saves automatically when it detects you're logged in.");
  console.log("(Waiting up to 10 minutes)\n");

  const browser = await webkit.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Safari/605.1.15",
  });

  // Save session on exit regardless
  const save = async () => {
    try {
      await context.storageState({ path: SESSION_FILE });
      const { statSync } = await import("node:fs");
      console.log(`\nSession saved → ${SESSION_FILE} (${statSync(SESSION_FILE).size} bytes)`);
    } catch { /* context already closed */ }
  };

  const page = await context.newPage();
  await page.goto("https://www.tiktok.com/login/phone-or-email/email");
  await page.waitForTimeout(3000);

  // Auto-dismiss cookie consent so it doesn't block the form
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    const allow = btns.find(b => /allow all/i.test(b.textContent || ""));
    if (allow) (allow as HTMLButtonElement).click();
  });

  let saved = false;
  for (let i = 0; i < 300; i++) { // 10 minutes max (300 × 2s)
    await page.waitForTimeout(2000);

    const url = page.url();
    const isOnLoginPage = /login|passport|signup|register/i.test(url);

    if (!isOnLoginPage && url.includes("tiktok.com")) {
      // Also check we have at least some meaningful cookies
      const cookies = await context.cookies(["https://www.tiktok.com"]);
      if (cookies.length > 3) {
        console.log(`\nLogin detected at: ${url}`);
        await page.waitForTimeout(2000); // let session settle
        await save();
        saved = true;
        break;
      }
    }

    if (i % 15 === 0 && i > 0) {
      console.log(`Still waiting... (${Math.round(i * 2 / 60)} min elapsed, current URL: ${url.slice(0, 60)})`);
    }
  }

  await browser.close();

  if (!saved) {
    console.error("\nTimeout — login not detected within 10 minutes.");
    process.exit(1);
  }

  console.log("TikTok will now auto-post using this session.");
}

main().catch((err) => { console.error(err); process.exit(1); });
