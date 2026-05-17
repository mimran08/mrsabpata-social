import { webkit } from "playwright";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { log } from "../utils/logger.js";

const ROLE = "X-Browser";
const COOKIES_FILE = path.join("company", "x-cookies.json");

// ─── Post a tweet using the saved Safari session cookies ─────────────────────

export async function postViaBrowser(text: string, imagePath?: string): Promise<void> {
  // Load cookies extracted from real Safari session
  let storageState: string | undefined;
  try {
    await fs.access(COOKIES_FILE);
    storageState = COOKIES_FILE;
  } catch {
    throw new Error("X cookies not found — run: python3 scripts/extract-x-cookies.py");
  }

  // headless: false — X's React compose box doesn't update state properly in headless WebKit
  const browser = await webkit.launch({ headless: false });

  const context = await browser.newContext({
    storageState,
    viewport: { width: 1280, height: 900 },
  });

  const page = await context.newPage();

  try {
    // Go straight to compose — no need to find the button
    await page.goto("https://x.com/compose/post", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2500);

    const url = page.url();
    if (url.includes("/login") || url.includes("/i/flow")) {
      await browser.close();
      throw new Error("X session expired — re-run: python3 scripts/extract-x-cookies.py");
    }

    log(ROLE, "info", "Compose dialog open");

    // Diagnostic screenshot right after load (before any interaction)
    await page.screenshot({ path: `logs/debug-x-loaded-${Date.now()}.png` }).catch(() => {});

    // Dismiss any cookie/consent overlay using JS (bypasses pointer-events blocking)
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const accept = btns.find(b => /accept.*cookies/i.test(b.textContent || "") || /refuse.*essential/i.test(b.textContent || ""));
      if (accept) (accept as HTMLButtonElement).click();
    });
    await page.waitForTimeout(1500);

    const textarea = page.locator('[data-testid="tweetTextarea_0"]').first();
    await textarea.waitFor({ state: "visible", timeout: 20000 });

    // Verifies typed content roughly matches input — normalizes whitespace and
    // requires at least 80% of the original length. Prevents posting a garbled
    // textarea (e.g. only a trailing hashtag) when input reordered/truncated.
    const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
    const expected = normalize(text);
    const goodEnough = (actual: string) => {
      const a = normalize(actual);
      if (a.length < expected.length * 0.8) return false;
      // first 30 chars of expected must appear in actual (catches "only hashtag survived")
      const head = expected.slice(0, Math.min(30, expected.length));
      return a.includes(head);
    };

    const clearAndType = async (strategy: "keyboard-type" | "clipboard"): Promise<string> => {
      await textarea.click({ force: true });
      await page.waitForTimeout(300);
      // Clear via real keyboard events so React tracks the change
      await page.keyboard.press("Meta+a");
      await page.keyboard.press("Control+a");
      await page.keyboard.press("Backspace");
      await page.waitForTimeout(200);

      if (strategy === "keyboard-type") {
        await page.keyboard.type(text, { delay: 8 });
      } else {
        await page.evaluate((t) => {
          const dt = new DataTransfer();
          dt.setData("text/plain", t);
          const el = document.querySelector('[data-testid="tweetTextarea_0"]') as HTMLElement;
          if (el) {
            el.focus();
            el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
          }
        }, text);
      }
      await page.waitForTimeout(600);
      return await textarea.evaluate((el) => (el as HTMLElement).innerText?.trim() || "");
    };

    // Primary: real keyboard events (slowest but most React-compatible).
    let typed = await clearAndType("keyboard-type");
    if (goodEnough(typed)) {
      log(ROLE, "info", `Text entered via keyboard.type (${typed.length}/${expected.length} chars)`);
    } else {
      log(ROLE, "warn", `keyboard.type produced unexpected text (${typed.length}/${expected.length}) — retrying with clipboard`);
      typed = await clearAndType("clipboard");
      if (goodEnough(typed)) {
        log(ROLE, "info", `Text entered via clipboard (${typed.length}/${expected.length} chars)`);
      } else {
        await page.screenshot({ path: `logs/debug-x-text-verify-failed-${Date.now()}.png` }).catch(() => {});
        throw new Error(`X text input verification failed (got ${typed.length}/${expected.length} chars) — aborting to avoid posting garbled content`);
      }
    }
    await page.waitForTimeout(300);

    // Attach image
    if (imagePath) {
      try {
        const fileInput = page.locator('input[type="file"][accept*="image"]').first();
        await fileInput.setInputFiles(path.resolve(imagePath), { timeout: 5000 });
        log(ROLE, "info", "Image attached — waiting for upload");
        await page.waitForTimeout(12000); // give X time to process the upload (was 8s — bumped to 12s)
      } catch {
        log(ROLE, "warn", "Could not attach image — posting text only");
      }
    }

    // Debug screenshot before submitting
    await page.screenshot({ path: `logs/debug-x-pre-post-${Date.now()}.png` }).catch(() => {});

    // Submit via keyboard shortcut first — Ctrl+Enter bypasses aria-disabled on the Post button.
    // X's React onClick handler checks content before submitting; force-clicking an aria-disabled
    // button sends pointer events but React ignores them. The keyboard shortcut goes through
    // the textarea's keydown handler which does submit regardless of button state.
    await textarea.click({ force: true });
    await page.waitForTimeout(300);
    await page.keyboard.press("Control+Enter");
    log(ROLE, "info", "Submitted via Control+Enter");

    // Wait for compose dialog to disappear (confirms successful post)
    const dialogGone = await page.locator('[data-testid="tweetButtonInline"], [data-testid="tweetButton"]').isHidden({ timeout: 10000 }).catch(() => false);

    if (!dialogGone) {
      // Keyboard shortcut didn't work — fall back to button click
      log(ROLE, "info", "Keyboard shortcut unclear — trying Post button click");
      const postBtn = page.locator('[data-testid="tweetButtonInline"], [data-testid="tweetButton"]').first();
      if (await postBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await postBtn.click({ force: true });
        log(ROLE, "info", "Clicked Post button (fallback)");
      } else {
        const textBtn = page.locator("button").filter({ hasText: /^Post$/ }).first();
        await textBtn.click({ force: true, timeout: 5000 });
        log(ROLE, "info", "Clicked Post button by text (fallback)");
      }
      await page.waitForTimeout(3000);
      const dialogGone2 = await page.locator('[data-testid="tweetButtonInline"], [data-testid="tweetButton"]').isHidden({ timeout: 8000 }).catch(() => false);
      if (!dialogGone2) {
        await page.screenshot({ path: `logs/debug-x-post-failed-${Date.now()}.png` }).catch(() => {});
        log(ROLE, "warn", "Compose dialog still visible — tweet may not have posted");
      }
    }

    log(ROLE, "info", "Posted to X via browser");
  } finally {
    await browser.close();
  }
}
