import { chromium } from "playwright";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { log } from "../utils/logger.js";
import { imageToVideo } from "../utils/image-gen.js";

const ROLE = "TikTok-Browser";
const SESSION_FILE = path.join("company", "tiktok-session.json");
const COOKIES_FILE = path.join("company", "tiktok-cookies.json");

// TikTok Studio shows a react-joyride onboarding tour whose overlay intercepts all
// clicks. Escape doesn't close it — you must click the button inside its portal
// (label varies). Click it (up to 5 steps) until the portal disappears.
async function dismissJoyride(page: import("playwright").Page): Promise<void> {
  for (let i = 0; i < 5; i++) {
    const gone = await page.evaluate(() => {
      const portal = document.querySelector("#react-joyride-portal");
      if (!portal) return true;
      const btn = portal.querySelector("button") as HTMLButtonElement | null;
      if (btn) { btn.click(); return false; }
      return false;
    });
    if (gone) return;
    await page.waitForTimeout(600);
  }
}

export async function postViaTikTok(caption: string, imagePath?: string): Promise<void> {
  const hasSession = await fs.access(SESSION_FILE).then(() => true).catch(() => false);
  const hasCookies = await fs.access(COOKIES_FILE).then(() => true).catch(() => false);

  if (!hasSession && !hasCookies) {
    throw new Error(
      "TikTok not set up — run: python3 scripts/extract-cookies.py (log into tiktok.com in Safari first)"
    );
  }

  const storageState = hasSession ? SESSION_FILE : COOKIES_FILE;

  // TikTok Studio only accepts video — convert PNG to MP4 if needed (MP4 is passed directly)
  let uploadPath = imagePath;
  if (imagePath && /\.png$/i.test(imagePath)) {
    try {
      uploadPath = await imageToVideo(imagePath);
      log(ROLE, "info", `Image converted to video: ${uploadPath}`);
    } catch (err) {
      log(ROLE, "warn", `Image→video conversion failed: ${String(err).slice(0, 80)} — uploading image directly`);
    }
  }

  // Use Chromium — TikTok Studio shows "upgrade browser" warning in WebKit
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    storageState,
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();

  try {
    await page.goto("https://www.tiktok.com/tiktokstudio/upload?from=upload", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(4000);

    const url = page.url();
    if (url.includes("/login") || url.includes("passport")) {
      await browser.close();
      throw new Error("TikTok session expired — re-run: python3 scripts/extract-cookies.py");
    }

    log(ROLE, "info", "TikTok Studio loaded");

    if (uploadPath) {
      // Use Playwright locator to trigger file chooser — page.evaluate click doesn't count as user gesture
      const [fileChooser] = await Promise.all([
        page.waitForEvent("filechooser", { timeout: 15000 }),
        page.locator("button").filter({ hasText: /^Select videos$/i }).first().click(),
      ]);
      await fileChooser.setFiles(path.resolve(uploadPath));
      log(ROLE, "info", "Video uploaded to TikTok — waiting for processing");
      await page.waitForTimeout(15000); // TikTok takes longer to process video
    }

    // Dismiss the TikTok onboarding tour (react-joyride). Its overlay intercepts all
    // clicks — including Post — which is the main cause of silent publish failures.
    // Escape doesn't close react-joyride; you must click the button inside its portal
    // (label varies: Skip/Next/Got it/×). Loop until the portal is gone.
    await dismissJoyride(page);

    // Fill caption — TikTok Studio uses a Draft.js contenteditable.
    // TikTok auto-fills the field with the uploaded filename, so we must
    // select-all and delete before typing the real caption.
    //
    // The select-all shortcut is platform-specific (Meta+a on macOS, Control+a
    // elsewhere). Previously hardcoded Control+a — that's a no-op on macOS
    // Chromium, leaving the bare filename as the published caption. Use both:
    // press both shortcuts AND verify with a JS fallback that clears the
    // Draft.js editor's text content directly.
    const captionEl = page.locator('[contenteditable="true"]').first();
    await captionEl.waitFor({ state: "visible", timeout: 20000 });
    await captionEl.click({ force: true });
    await page.waitForTimeout(300);
    await page.keyboard.press(process.platform === "darwin" ? "Meta+a" : "Control+a");
    await page.keyboard.press("Backspace");
    await page.waitForTimeout(150);
    // Verify the field is empty; if not, force-clear via DOM (Draft.js needs an input event)
    const remaining = await captionEl.evaluate(el => (el as HTMLElement).innerText.trim());
    if (remaining.length > 0) {
      log(ROLE, "warn", `Caption clear via keyboard failed (still has '${remaining.slice(0, 40)}') — using DOM fallback`);
      await captionEl.evaluate(el => {
        const e = el as HTMLElement;
        // Select all text inside the contenteditable, then dispatch beforeinput delete
        const range = document.createRange();
        range.selectNodeContents(e);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      });
      await page.keyboard.press("Backspace");
      await page.waitForTimeout(150);
    }
    await page.keyboard.type(caption.slice(0, 2200), { delay: 10 });
    await page.waitForTimeout(500);
    // Final verify — caption must contain the first non-hashtag word of what we sent
    const firstWord = caption.split(/\s+/).find(w => !w.startsWith("#")) ?? "";
    if (firstWord.length > 2) {
      const finalText = await captionEl.evaluate(el => (el as HTMLElement).innerText);
      if (!finalText.toLowerCase().includes(firstWord.toLowerCase())) {
        throw new Error(`TikTok caption did not take — expected '${firstWord}', got '${finalText.slice(0, 80)}'`);
      }
    }

    // Dismiss the hashtag autocomplete dropdown. It stays open after typing #tags and
    // overlays the Post button — a click then lands on the dropdown, not Post.
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    await page.mouse.click(10, 10);
    await page.waitForTimeout(500);
    await dismissJoyride(page); // tour can reappear after caption focus

    // Wait for Post button to be enabled (video still processing while disabled)
    await page.waitForFunction(() => {
      const btn = Array.from(document.querySelectorAll("button"))
        .find(b => /^(post|publish)$/i.test(b.textContent?.trim() || "")) as HTMLButtonElement | undefined;
      return btn && btn.getAttribute("aria-disabled") !== "true" && !btn.disabled;
    }, { timeout: 60000 }).catch(() => {});

    // Click Post and VERIFY it published. A successful post navigates away from /upload
    // to /content. If it doesn't, the click was swallowed (overlay) — retry up to 3×.
    // Previously we logged "Posted" after a blind click, which silently lost posts.
    let published = false;
    for (let attempt = 1; attempt <= 3 && !published; attempt++) {
      await dismissJoyride(page);
      await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll("button"))
          .find(b => /^(post|publish)$/i.test(b.textContent?.trim() || "")) as HTMLButtonElement | undefined;
        btn?.click();
      });
      published = await page.waitForURL(/tiktokstudio\/content/, { timeout: 20000 }).then(() => true).catch(() => false);
      if (!published) log(ROLE, "warn", `TikTok Post click ${attempt} didn't publish — retrying`);
    }

    if (!published) {
      await page.screenshot({ path: `logs/debug-tiktok-no-publish-${Date.now()}.png` }).catch(() => {});
      throw new Error("TikTok post did not publish after 3 attempts (no redirect to /content)");
    }
    log(ROLE, "info", "Posted to TikTok (confirmed — redirected to content manager)");
  } finally {
    await browser.close();
    // Clean up temp video file
    if (uploadPath && uploadPath !== imagePath) {
      await fs.unlink(uploadPath).catch(() => {});
    }
  }
}
