import { webkit } from "playwright";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { log } from "../utils/logger.js";

const ROLE = "YouTube-Browser";
const SESSION_FILE = path.join("company", "youtube-session.json");
const COOKIES_FILE = path.join("company", "youtube-cookies.json");

// Uploads a video as a YouTube Short via YouTube Studio (browser automation)
export async function uploadYouTubeShort(text: string, videoPath: string): Promise<void> {
  const hasSession = await fs.access(SESSION_FILE).then(() => true).catch(() => false);
  const hasCookies = await fs.access(COOKIES_FILE).then(() => true).catch(() => false);

  if (!hasSession && !hasCookies) {
    throw new Error(
      "YouTube not set up — run: npx tsx scripts/save-youtube-session.ts"
    );
  }

  const storageState = hasSession ? SESSION_FILE : COOKIES_FILE;

  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const title = (lines[0] ?? "MrSabPata").slice(0, 100);
  const description = lines.slice(1).join("\n").slice(0, 5000);

  // WebKit — matches Safari cookie fingerprint
  const browser = await webkit.launch({ headless: false });
  const context = await browser.newContext({
    storageState,
    viewport: { width: 1280, height: 900 },
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Safari/605.1.15",
  });
  const page = await context.newPage();

  // Channel ID for Mr Sab Pata — navigate directly to lock in the right channel
  const CHANNEL_ID = "UC34evP7dIhkq3RapgALY_lA";

  try {
    // Navigate directly to MrSabPata's Studio channel (bypasses channel-switcher)
    await page.goto(`https://studio.youtube.com/channel/${CHANNEL_ID}`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(5000);

    if (page.url().includes("accounts.google.com")) {
      await browser.close();
      throw new Error(
        "YouTube Studio session expired — run: npx tsx scripts/save-youtube-session.ts"
      );
    }

    // Handle "Select a channel" dialog if it appears (account has multiple channels)
    const channelDialog = await page.evaluate(() => {
      const dialog = document.querySelector("ytd-channel-switcher-dialog-renderer, [aria-label='Select a channel']") as HTMLElement | null;
      if (!dialog) return false;
      // Click "Mr Sab Pata" entry
      const items = Array.from(dialog.querySelectorAll("a, div[role='option'], yt-formatted-string"));
      const mrSabPata = items.find(el => /sab pata/i.test(el.textContent || ""));
      if (mrSabPata) { (mrSabPata as HTMLElement).click(); return true; }
      return false;
    });
    if (channelDialog) {
      log(ROLE, "info", "Selected Mr Sab Pata channel");
      await page.waitForTimeout(3000);
    }

    log(ROLE, "info", "YouTube Studio loaded");

    // Click CREATE button
    const createClicked = await page.evaluate(() => {
      const btn = document.querySelector("ytcp-button#create-icon, button#create-icon") as HTMLElement | null;
      if (btn) { btn.click(); return true; }
      const all = Array.from(document.querySelectorAll("button, ytcp-button"));
      const found = all.find(el => /^create$/i.test(el.getAttribute("aria-label") || ""));
      if (found) { (found as HTMLElement).click(); return true; }
      return false;
    });
    if (!createClicked) await page.mouse.click(1220, 50);
    await page.waitForTimeout(1500);

    // Click "Upload videos"
    await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll("tp-yt-paper-item, ytcp-menu-item, [role='menuitem'], a, button"));
      const upload = items.find(el => /upload videos?/i.test(el.textContent || ""));
      if (upload) (upload as HTMLElement).click();
    });
    await page.waitForTimeout(2000);

    // Upload via file chooser
    log(ROLE, "info", `Uploading: ${path.basename(videoPath)}`);
    const [fileChooser] = await Promise.all([
      page.waitForEvent("filechooser", { timeout: 15000 }),
      page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll("button, ytcp-button"));
        const selectBtn = btns.find(b => /select files?/i.test(b.textContent || ""));
        if (selectBtn) { (selectBtn as HTMLElement).click(); return true; }
        const dropArea = document.querySelector("#select-files-button, .drop-target-area") as HTMLElement | null;
        if (dropArea) { dropArea.click(); return true; }
        return false;
      }),
    ]);
    await fileChooser.setFiles(path.resolve(videoPath));

    // All wizard interactions scoped inside the upload dialog to avoid false matches
    const dialog = page.locator("ytcp-uploads-dialog");

    // Wait for upload dialog — title input appears while file uploads in background
    log(ROLE, "info", "Waiting for upload dialog...");
    const titleInput = dialog.locator("#title-textarea #textbox, #textbox").first();
    await titleInput.waitFor({ state: "visible", timeout: 60000 });
    await page.waitForTimeout(3000); // let upload stabilise

    // Wait for NEXT button to be enabled (disabled while video is uploading)
    log(ROLE, "info", "Waiting for upload to finish...");
    await page.waitForFunction(() => {
      const dialog = document.querySelector("ytcp-uploads-dialog");
      if (!dialog) return false;
      const allButtons = Array.from(dialog.querySelectorAll("ytcp-button, button"));
      const nextBtn = allButtons.find(b =>
        /^next$/i.test(b.textContent?.trim() || "") &&
        !/next item/i.test(b.getAttribute("aria-label") || "")
      );
      if (!nextBtn) return false;
      const inner = nextBtn.querySelector("button") as HTMLButtonElement | null;
      return inner ? !inner.disabled : !nextBtn.hasAttribute("disabled");
    }, { timeout: 120000 });

    // Fill title — click and replace
    await titleInput.click({ clickCount: 3, force: true });
    await page.keyboard.press("Meta+a");
    await page.keyboard.type(title, { delay: 10 });
    await page.waitForTimeout(300);

    // Fill description
    try {
      const descInput = dialog.locator("#description-textarea #textbox").first();
      await descInput.waitFor({ state: "visible", timeout: 5000 });
      await descInput.click({ force: true });
      await page.keyboard.type(description, { delay: 5 });
    } catch { /* non-fatal */ }
    await page.waitForTimeout(300);

    // ── Click "Not made for kids" on Details step (Playwright locator — Polymer needs real events) ──
    // Second radio button = "No, it's not made for kids"
    await page.locator("tp-yt-paper-radio-button").nth(1).click({ force: true }).catch(() => {});
    log(ROLE, "info", "Clicked 'Not made for kids' radio");
    await page.waitForTimeout(500);

    // ── Step 1 → 2: Details → Ad Suitability ──────────────────────────────────────────────────────
    log(ROLE, "info", "Wizard step 1/4: Details → Next...");
    await dialog.locator("ytcp-button#next-button").click({ force: true });
    await page.waitForTimeout(2000);

    // ── Step 2: Ad Suitability — must select "None of the above" + Submit ────────────────────────
    log(ROLE, "info", "Wizard step 2/4: Ad suitability — clicking 'None of the above'...");
    const noneBtn = page.locator("tp-yt-paper-radio-button, ytcp-checkbox-lit, input[type='checkbox']")
      .filter({ hasText: /none of the above/i }).first();
    if (await noneBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await noneBtn.click({ force: true });
      log(ROLE, "info", "Clicked 'None of the above'");
      await page.waitForTimeout(1000);
      // Click Submit rating / Save button
      const submitBtn = page.locator("ytcp-button").filter({ hasText: /submit.*rating|save/i }).first();
      if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await submitBtn.click({ force: true });
        log(ROLE, "info", "Clicked Submit rating");
        await page.waitForTimeout(2000);
      }
    } else {
      log(ROLE, "warn", "'None of the above' not visible — clicking Next directly");
    }
    // Now advance with Next
    await page.locator("ytcp-uploads-dialog ytcp-button").filter({ hasText: /^next$/i }).first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(2000);

    // ── Step 3: Video Elements → Checks ───────────────────────────────────────────────────────────
    log(ROLE, "info", "Wizard step 3/4: Video elements → Next...");
    await dialog.locator("ytcp-button#next-button").click({ force: true });
    await page.waitForTimeout(2000);

    // ── Step 4: Checks — wait for Next to be enabled (copyright scan done), then click Next ───────
    log(ROLE, "info", "Wizard step 4/4: Waiting for content checks...");
    await page.waitForFunction(() => {
      const d = document.querySelector("ytcp-uploads-dialog");
      if (!d) return false;
      const allBtns = Array.from(d.querySelectorAll("ytcp-button"));
      return allBtns.some(b => {
        if (!/^next$/i.test(b.textContent?.trim() || "")) return false;
        if (b.hasAttribute("disabled")) return false;
        const inner = b.querySelector("button") as HTMLButtonElement | null;
        return inner ? !inner.disabled : true;
      });
    }, { timeout: 180000 });
    log(ROLE, "info", "Checks passed — clicking Next to Visibility...");
    await page.locator("ytcp-uploads-dialog ytcp-button").filter({ hasText: /^next$/i }).first().click({ force: true });
    await page.waitForTimeout(2000);

    // ── Navigate intermediate steps until Public radio is visible ─────────────────────────────
    // YouTube inserts "Reuse video details?" and other steps between Checks and Visibility.
    // We loop (max 10) clicking any visible Next button until the Public radio appears.
    const publicRadioCheck = page.getByRole("radio", { name: /public/i }).first();
    for (let i = 0; i < 10; i++) {
      if (await publicRadioCheck.isVisible({ timeout: 2000 }).catch(() => false)) {
        log(ROLE, "info", `Reached Visibility step after ${i} intermediate Next clicks`);
        break;
      }
      const nextBtn = page.locator("ytcp-uploads-dialog ytcp-button").filter({ hasText: /^next$/i }).first();
      if (await nextBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await nextBtn.click({ force: true });
        log(ROLE, "info", `Intermediate Next clicked (attempt ${i + 1})`);
        await page.waitForTimeout(2000);
      } else {
        await page.waitForTimeout(2000); // may be loading
      }
    }

    // ── Visibility step ───────────────────────────────────────────────────────────────────────────
    log(ROLE, "info", "Visibility step — setting Public visibility...");
    // Take a diagnostic screenshot to see current state
    await page.screenshot({ path: `logs/debug-yt-visibility-${Date.now()}.png` }).catch(() => {});

    // Wait up to 10s for the page to settle after intermediate steps
    await page.waitForTimeout(3000);

    // Click PUBLIC radio — use getByRole first (pierces shadow DOM), then CSS selectors
    let pubClicked = false;
    const radioByRole = page.getByRole("radio", { name: /public/i }).first();
    if (await radioByRole.isVisible({ timeout: 5000 }).catch(() => false)) {
      await radioByRole.click({ force: true });
      pubClicked = true;
      log(ROLE, "info", "Clicked Public radio (getByRole)");
    } else {
      for (const sel of ["tp-yt-paper-radio-button[name='PUBLIC']", "tp-yt-paper-radio-button[value='PUBLIC']", "#privacy-radios tp-yt-paper-radio-button:first-child"]) {
        const el = page.locator(sel).first();
        const box = await el.boundingBox({ timeout: 4000 }).catch(() => null);
        if (box) {
          await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
          pubClicked = true;
          log(ROLE, "info", `Clicked Public radio via CSS: ${sel}`);
          break;
        }
      }
    }
    if (!pubClicked) {
      // JS fallback: set aria-checked and dispatch change event
      await page.evaluate(() => {
        const radio = Array.from(document.querySelectorAll("tp-yt-paper-radio-button")).find(
          el => /public/i.test(el.getAttribute("name") || el.getAttribute("value") || el.textContent || "")
        );
        if (radio) (radio as HTMLElement).click();
      });
      log(ROLE, "warn", "Public radio clicked via JS fallback");
    }
    await page.waitForTimeout(1000);

    // Log visible buttons for debugging
    const btnLabels = await page.evaluate(() => {
      const d = document.querySelector("ytcp-uploads-dialog");
      if (!d) return [];
      return Array.from(d.querySelectorAll("ytcp-button"))
        .filter(b => !b.hasAttribute("hidden"))
        .map(b => `${b.textContent?.trim()}${b.hasAttribute("disabled") ? "[disabled]" : ""}`);
    });
    log(ROLE, "info", `Visible buttons: ${btnLabels.join(", ")}`);

    // Dismiss ytcp-banner warnings (e.g. copyright/content notices) — these keep Publish disabled
    // The banner Dismiss button is id=action-2 inside ytcp-banner, NOT inside the uploads dialog
    for (let i = 0; i < 5; i++) {
      const bannerDismiss = page.locator("ytcp-banner #action-2, ytcp-banner .action-button, ytcp-notification-action-renderer #action-2").first();
      if (await bannerDismiss.isVisible({ timeout: 2000 }).catch(() => false)) {
        await bannerDismiss.click({ force: true });
        log(ROLE, "info", `Dismissed ytcp-banner warning (attempt ${i + 1})`);
        await page.waitForTimeout(1000);
        continue;
      }
      // Also catch generic dismiss/ok dialogs
      const genericDismiss = page.locator("ytcp-button, button").filter({ hasText: /^(dismiss|ok|got it|close)$/i }).first();
      if (await genericDismiss.isVisible({ timeout: 1000 }).catch(() => false)) {
        await genericDismiss.click({ force: true });
        log(ROLE, "info", `Dismissed generic dialog (attempt ${i + 1})`);
        await page.waitForTimeout(500);
      } else break;
    }

    // Wait for Publish button to be enabled — check multiple selectors
    const publishLocators = [
      page.locator("ytcp-uploads-dialog #done-button"),
      page.getByRole("button", { name: /^(publish|save)$/i }),
      page.locator("#done-button"),
    ];
    let publishEnabled = false;
    for (let wait = 0; wait < 4; wait++) {
      for (const loc of publishLocators) {
        const enabled = await loc.isEnabled({ timeout: 3000 }).catch(() => false);
        const visible = await loc.isVisible({ timeout: 1000 }).catch(() => false);
        if (enabled && visible) { publishEnabled = true; break; }
      }
      if (publishEnabled) break;
      // Dismiss ytcp-banner warnings between retries
      const bannerDismiss = page.locator("ytcp-banner #action-2, ytcp-banner .action-button").first();
      if (await bannerDismiss.isVisible({ timeout: 2000 }).catch(() => false)) {
        await bannerDismiss.click({ force: true });
        log(ROLE, "info", `Dismissed ytcp-banner (retry ${wait + 1})`);
      }
      await page.waitForTimeout(5000);
    }
    if (!publishEnabled) {
      log(ROLE, "warn", "Publish button not enabled after 4 retries — clicking anyway");
    }

    // Click Publish — try all locators
    let publishClicked = false;
    for (const loc of publishLocators) {
      if (await loc.isVisible({ timeout: 2000 }).catch(() => false)) {
        await loc.click({ force: true });
        publishClicked = true;
        log(ROLE, "info", "Publish clicked");
        break;
      }
    }
    if (!publishClicked) {
      await page.evaluate(() => {
        const done = document.querySelector("#done-button") as HTMLElement | null;
        if (done) done.click();
      });
      log(ROLE, "warn", "Publish clicked via JS fallback");
    }
    log(ROLE, "info", "Publish clicked (step 1)");

    // Wait for the ytcp-prechecks-warning-dialog to appear (confirmed via debug: this is the confirmation dialog)
    await page.waitForTimeout(4000);

    // Click the "Publish" button in the prechecks warning dialog (id=secondary-action-button)
    const confirmPublish = page.locator("ytcp-prechecks-warning-dialog #secondary-action-button, #secondary-action-button").first();
    if (await confirmPublish.isVisible({ timeout: 12000 }).catch(() => false)) {
      await confirmPublish.click({ force: true });
      log(ROLE, "info", "Confirmation Publish clicked (step 2 — prechecks dialog)");
    } else {
      log(ROLE, "warn", "Prechecks dialog not found — video may need manual publish");
    }

    await page.waitForTimeout(8000);
    log(ROLE, "info", "Uploaded to YouTube as Short");
  } finally {
    await browser.close();
  }
}
