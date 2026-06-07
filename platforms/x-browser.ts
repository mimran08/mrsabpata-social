import { chromium } from "playwright";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { log } from "../utils/logger.js";

const ROLE = "X-Browser";
const COOKIES_FILE = path.join("company", "x-cookies.json");

// @MrSabPata's user ID — twid cookie MUST match this. 2026-05-24 incident:
// extract-cookies.py grabbed @GeoCricLive's cookies because Safari was on that
// account; without this guard the cron would happily post to the wrong account.
const MRSABPATA_TWID = "u%3D1605805926";

// Hard timeout: kills X after 120s so a silent hang doesn't starve TT/IG/YT.
// Chromium runs the same path as scripts/post-x-manual.ts (which lands in ~15s),
// but allow extra headroom for cold browser boot on the runner.
const X_DEADLINE_MS = 120_000;

export async function postViaBrowser(text: string, imagePath?: string): Promise<void> {
  return Promise.race([
    _postViaBrowserImpl(text, imagePath),
    new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error(`X timed out after ${X_DEADLINE_MS}ms — aborting so other platforms can run`)), X_DEADLINE_MS)
    ),
  ]);
}

interface CookieIn {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
}

async function loadCookies(): Promise<CookieIn[]> {
  try {
    await fs.access(COOKIES_FILE);
  } catch {
    throw new Error("X cookies not found — run: python3 scripts/extract-cookies.py x");
  }
  const raw = JSON.parse(await fs.readFile(COOKIES_FILE, "utf-8")) as { cookies: CookieIn[] };
  return raw.cookies.map(c => {
    const ss = c.sameSite;
    const sameSite = ss === "None" || ss === "Strict" || ss === "Lax" ? ss : "Lax";
    return { ...c, sameSite };
  });
}

async function _postViaBrowserImpl(text: string, imagePath?: string): Promise<void> {
  // Hard-truncate to 270 chars (X non-Premium limit is 280; leaves a 10-char
  // buffer for URL-weight counting). Tweets over 280 silently fail the submit.
  if (text.length > 270) {
    const hashtags = text.match(/#\w+(\s+#\w+)*\s*$/)?.[0] ?? "";
    const body = text.slice(0, text.length - hashtags.length);
    const bodyBudget = 270 - hashtags.length - 4;
    text = body.slice(0, bodyBudget).trimEnd() + "…\n\n" + hashtags.trim();
    text = text.slice(0, 270);
  }

  const cookies = await loadCookies();
  const twid = cookies.find(c => c.name === "twid")?.value;
  if (twid !== MRSABPATA_TWID) {
    throw new Error(`Cookies are for the wrong X account (twid=${twid}). Need ${MRSABPATA_TWID} (@MrSabPata). Switch Safari to @MrSabPata, then re-run: python3 scripts/extract-cookies.py x`);
  }

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addCookies(cookies as Parameters<typeof context.addCookies>[0]);
  const page = await context.newPage();

  try {
    await page.goto("https://x.com/compose/post", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2500);

    if (page.url().includes("/login") || page.url().includes("/i/flow")) {
      throw new Error("X session expired — re-run: python3 scripts/extract-cookies.py x");
    }

    const ta = page.locator('div[role="dialog"] [data-testid="tweetTextarea_0"]').first();
    await ta.waitFor({ state: "visible", timeout: 15000 });
    await ta.pressSequentially(text, { delay: 10 });
    await page.waitForTimeout(300);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);

    if (imagePath) {
      const fileInput = page.locator('div[role="dialog"] input[data-testid="fileInput"]').first();
      await fileInput.setInputFiles(path.resolve(imagePath));
      log(ROLE, "info", "Image attached — waiting for upload");
      await page.waitForTimeout(3000);

      const hasMedia = await page.evaluate(() =>
        !!document.querySelector('div[role="dialog"] [data-testid="attachments"] img, div[role="dialog"] img[src*="blob:"]')
      );
      if (!hasMedia) {
        await page.screenshot({ path: `logs/debug-x-no-media-${Date.now()}.png` }).catch(() => {});
        throw new Error("Image preview did not appear after setInputFiles — aborting");
      }
    }

    const beforeUrl = page.url();
    await page.evaluate(() => {
      const btn = document.querySelector('div[role="dialog"] [data-testid="tweetButton"]') as HTMLButtonElement | null;
      if (btn?.getAttribute("aria-disabled") === "true") throw new Error("Post button is disabled (text over 280 chars?)");
      btn?.click();
    });
    await page.waitForURL((u) => !u.toString().includes("/compose"), { timeout: 15000 }).catch(() => {});

    if (page.url() === beforeUrl) {
      await page.screenshot({ path: `logs/debug-x-submit-failed-${Date.now()}.png` }).catch(() => {});
      throw new Error("X submit failed — still on /compose. Possible duplicate-content rejection.");
    }

    log(ROLE, "info", "Posted to X via browser");
  } finally {
    await browser.close();
  }
}
