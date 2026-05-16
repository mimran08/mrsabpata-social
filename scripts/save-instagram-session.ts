#!/usr/bin/env tsx
/**
 * One-time setup: open a visible browser, log into Instagram, save the session.
 * Run: npx tsx --env-file=.env.local scripts/save-instagram-session.ts
 */
import { webkit } from "playwright";
import * as path from "node:path";
import * as fs from "node:fs/promises";

const SESSION_FILE = path.join("company", "instagram-session.json");

async function main() {
  console.log("Opening browser — log into Instagram, then press Enter here.\n");

  const browser = await webkit.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Safari/605.1.15",
  });

  const page = await context.newPage();
  await page.goto("https://www.instagram.com/accounts/login/");

  console.log("Waiting for you to log in... (press Enter in this terminal when done)");

  await new Promise<void>((resolve) => {
    process.stdin.resume();
    process.stdin.once("data", () => { process.stdin.pause(); resolve(); });
  });

  await context.storageState({ path: SESSION_FILE });
  await browser.close();

  const stat = await fs.stat(SESSION_FILE);
  console.log(`\nSession saved to ${SESSION_FILE} (${stat.size} bytes)`);
  console.log("Instagram will now auto-post using this session.");
}

main().catch((err) => { console.error(err); process.exit(1); });
