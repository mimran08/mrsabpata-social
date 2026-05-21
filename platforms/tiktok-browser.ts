import { chromium } from "playwright";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { log } from "../utils/logger.js";
import { imageToVideo } from "../utils/image-gen.js";

const ROLE = "TikTok-Browser";
const SESSION_FILE = path.join("company", "tiktok-session.json");
const COOKIES_FILE = path.join("company", "tiktok-cookies.json");

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

    // Dismiss TikTok tutorial overlay if shown (react-joyride blocks caption click)
    const joyride = page.locator('[data-test-id="overlay"], .react-joyride__overlay').first();
    if (await joyride.isVisible().catch(() => false)) {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(500);
      // Also try clicking a Skip/Close button
      await page.locator("button").filter({ hasText: /skip|close|dismiss/i }).first().click({ force: true }).catch(() => {});
      await page.waitForTimeout(500);
    }

    // Fill caption — TikTok Studio uses a Draft.js contenteditable.
    // TikTok auto-fills the field with the uploaded filename, so we must
    // select-all and delete before typing the real caption.
    const captionEl = page.locator('[contenteditable="true"]').first();
    await captionEl.waitFor({ state: "visible", timeout: 20000 });
    await captionEl.click({ force: true });
    await page.waitForTimeout(300);
    await page.keyboard.press("Control+a");
    await page.keyboard.press("Backspace");
    await page.waitForTimeout(100);
    await page.keyboard.type(caption.slice(0, 2200), { delay: 10 });
    await page.waitForTimeout(500);

    // Click Post button — use Playwright locator
    const postBtn = page.locator("button").filter({ hasText: /^(post|publish)$/i }).first();
    await postBtn.waitFor({ state: "visible", timeout: 15000 });
    const isDisabled = await postBtn.isDisabled().catch(() => false);
    if (isDisabled) {
      // Wait for it to become enabled (video still processing)
      await page.waitForFunction(() => {
        const btn = Array.from(document.querySelectorAll("button"))
          .find(b => /^(post|publish)$/i.test(b.textContent?.trim() || "")) as HTMLButtonElement | undefined;
        return btn && !btn.disabled;
      }, { timeout: 60000 });
    }
    // force:true bypasses overlay interception (TikTok Studio has transient overlays
    // that make a plain .click() time out even though the button is enabled). Fall back
    // to a JS click if the Playwright click still doesn't land.
    try {
      await postBtn.click({ force: true, timeout: 10000 });
    } catch {
      await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll("button"))
          .find(b => /^(post|publish)$/i.test(b.textContent?.trim() || "")) as HTMLButtonElement | undefined;
        btn?.click();
      });
    }

    await page.waitForTimeout(8000);
    log(ROLE, "info", "Posted to TikTok");
  } finally {
    await browser.close();
    // Clean up temp video file
    if (uploadPath && uploadPath !== imagePath) {
      await fs.unlink(uploadPath).catch(() => {});
    }
  }
}
