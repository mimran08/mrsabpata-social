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
    await textarea.click({ force: true });
    await page.waitForTimeout(800);

    // Strategy 1: execCommand('insertText') — fires React's beforeinput/input chain,
    // much faster than pressSequentially and avoids per-character timeout issues
    let typed = "";
    try {
      await page.evaluate((t) => {
        const el = document.querySelector('[data-testid="tweetTextarea_0"]') as HTMLElement;
        if (el) {
          el.focus();
          document.execCommand("selectAll", false);
          document.execCommand("insertText", false, t);
        }
      }, text);
      await page.waitForTimeout(600);
      typed = await textarea.evaluate((el) => (el as HTMLElement).innerText?.trim() || "");
      if (typed) log(ROLE, "info", `Text entered via execCommand (${typed.length} chars)`);
    } catch { /* fall through */ }

    // Strategy 2: pressSequentially with higher timeout
    if (!typed) {
      log(ROLE, "info", "execCommand missed — trying pressSequentially");
      try {
        await textarea.click({ force: true });
        await page.waitForTimeout(400);
        await textarea.pressSequentially(text, { delay: 30, timeout: 90000 });
        await page.waitForTimeout(500);
        typed = await textarea.evaluate((el) => (el as HTMLElement).innerText?.trim() || "");
        if (typed) log(ROLE, "info", `Text entered via pressSequentially (${typed.length} chars)`);
      } catch (err) {
        log(ROLE, "warn", `pressSequentially failed: ${String(err).slice(0, 80)}`);
      }
    }

    // Strategy 3: clipboard paste — fastest, bypasses per-char issues
    if (!typed) {
      log(ROLE, "info", "Trying clipboard paste strategy");
      try {
        await page.evaluate((t) => {
          const dt = new DataTransfer();
          dt.setData("text/plain", t);
          const el = document.querySelector('[data-testid="tweetTextarea_0"]') as HTMLElement;
          if (el) {
            el.focus();
            el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
          }
        }, text);
        await page.waitForTimeout(800);
        typed = await textarea.evaluate((el) => (el as HTMLElement).innerText?.trim() || "");
        if (typed) log(ROLE, "info", `Text entered via clipboard paste (${typed.length} chars)`);
      } catch { /* fall through */ }
    }

    if (!typed) log(ROLE, "warn", "All text input strategies failed — attempting post anyway");
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
    await page.keyboard.press("Control+Return");
    log(ROLE, "info", "Submitted via Control+Return");

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
