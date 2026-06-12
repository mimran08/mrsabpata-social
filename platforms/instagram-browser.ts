import { webkit } from "playwright";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { log } from "../utils/logger.js";

const ROLE = "Instagram-Browser";
const SESSION_FILE = path.join("company", "instagram-session.json");
const COOKIES_FILE = path.join("company", "instagram-cookies.json");

// Best-effort: in the IG Reel upload wizard, locate the cover selection step
// (between trim and caption) and upload our branded PNG. Failure is logged
// but non-fatal — IG falls back to auto-pick (which is also our branded
// image because the video has a 1.2s static intro).
async function setInstagramCustomCover(
  page: import("playwright").Page,
  thumbnailPath: string,
): Promise<void> {
  try {
    // IG's cover step shows a strip of video frames + sometimes an "Add cover
    // from camera roll" button. Try to find any file input in the visible
    // wizard area that accepts images, OR an "Add from device" / "Upload from
    // computer" button that triggers a file chooser.
    const triggered = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll("button, [role='button'], div, span")) as HTMLElement[];
      const m = els.find(el => {
        const t = (el.innerText || el.textContent || "").trim().toLowerCase();
        return el.offsetParent !== null && (
          t === "add cover from camera roll" ||
          t === "upload from computer" ||
          t === "select cover" ||
          /add cover/i.test(t) ||
          /upload.*cover/i.test(t)
        );
      });
      if (m) { m.click(); return true; }
      return false;
    });
    if (!triggered) {
      log(ROLE, "info", "IG cover-upload affordance not found — using auto-pick (1.2s intro covers it)");
      return;
    }
    await page.waitForTimeout(2000);

    // Set the file on whatever input opened
    const fileInputs = page.locator("input[type='file'][accept*='image']");
    if (await fileInputs.count() > 0) {
      await fileInputs.first().setInputFiles(path.resolve(thumbnailPath));
      log(ROLE, "info", `Custom cover uploaded to IG: ${path.basename(thumbnailPath)}`);
      await page.waitForTimeout(4000);
    } else {
      log(ROLE, "info", "No image file input visible after triggering cover upload — skipping");
    }
  } catch (e) {
    log(ROLE, "warn", `setInstagramCustomCover failed (non-fatal): ${String(e).slice(0, 120)}`);
  }
}

// Posts a video as an Instagram Reel (falls back to image if not mp4/mov)
export async function postViaInstagram(caption: string, mediaPath: string, thumbnailPath?: string): Promise<void> {
  const hasSession = await fs.access(SESSION_FILE).then(() => true).catch(() => false);
  const hasCookies = await fs.access(COOKIES_FILE).then(() => true).catch(() => false);

  if (!hasSession && !hasCookies) {
    throw new Error(
      "Instagram not set up — run: python3 scripts/extract-cookies.py (or npx tsx scripts/save-instagram-session.ts)"
    );
  }

  const storageState = hasSession ? SESSION_FILE : COOKIES_FILE;
  const isVideo = /\.(mp4|mov|avi)$/i.test(mediaPath);

  // headless: false — Instagram blocks headless mode and hides modals
  const browser = await webkit.launch({ headless: false });
  const context = await browser.newContext({
    storageState,
    viewport: { width: 1280, height: 900 },
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Safari/605.1.15",
  });
  // Override platform detection — Instagram checks navigator.platform to decide feature availability.
  // Linux WebKit reports "Linux x86_64" which causes Instagram to hide the Reel creation option.
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "platform", { get: () => "MacIntel" });
    Object.defineProperty(window, "devicePixelRatio", { get: () => 2 });
  });
  const page = await context.newPage();

  try {
    await page.goto("https://www.instagram.com/", {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    await page.waitForTimeout(4000);

    if (page.url().includes("/accounts/login")) {
      await browser.close();
      throw new Error("Instagram session expired — re-run: python3 scripts/extract-cookies.py");
    }

    log(ROLE, "info", "Instagram home loaded");

    // Dismiss notifications prompt if shown
    const notNow = page.locator("button").filter({ hasText: /^not now$/i }).first();
    await notNow.click({ force: true }).catch(() => {});
    await page.waitForTimeout(800);

    // Click Create / New post — try multiple selector strategies (Instagram changes layout often)
    const createCandidates = [
      page.locator("a[href='/create/style/']").first(),
      page.locator("a[href*='create']").first(),
      page.locator("[aria-label='Create'], [aria-label='New post']").first(),
      page.locator("[aria-label*='create' i], [aria-label*='new post' i]").first(),
      page.locator("a, div[role='button'], span[role='button']").filter({ hasText: /^create$/i }).first(),
      page.locator("a, div[role='button']").filter({ hasText: /create/i }).first(),
    ];
    let createClicked = false;
    for (const loc of createCandidates) {
      if (await loc.isVisible({ timeout: 3000 }).catch(() => false)) {
        await loc.click({ force: true });
        createClicked = true;
        log(ROLE, "info", "Create button clicked");
        break;
      }
    }
    if (!createClicked) {
      // Last resort: JS click on any create/new-post anchor
      const jsClicked = await page.evaluate(() => {
        const candidates = Array.from(document.querySelectorAll('a[href*="create"], [aria-label*="create" i], [aria-label*="new post" i]'));
        if (candidates.length) { (candidates[0] as HTMLElement).click(); return true; }
        return false;
      });
      if (!jsClicked) throw new Error("Could not find Instagram Create button — UI may have changed");
      log(ROLE, "info", "Create button clicked via JS fallback");
    }
    await page.waitForTimeout(2000);

    if (isVideo) {
      // ── Video → Reel upload ──────────────────────────────────────────────────
      // Instagram web no longer has a separate "Reel" create option — the create (+)
      // menu is just Post / Live / Ad / AI. Uploading a VIDEO via "Post" makes it a
      // Reel automatically. (Previously the code looked for a "Reel" menu item, never
      // found it, and downgraded to a static image — that's the bug we're fixing.)
      await page.screenshot({ path: `logs/debug-ig-create-menu-${Date.now()}.png` }).catch(() => {});
      const menuItems = await page.evaluate(() =>
        Array.from(document.querySelectorAll("a, [role='menuitem'], [role='option']"))
          .filter(el => (el as HTMLElement).offsetParent !== null)
          .map(el => ({ text: el.textContent?.trim().slice(0, 40), href: (el as HTMLAnchorElement).href || "" }))
          .filter(i => i.text || i.href).slice(0, 20)
      ).catch(() => [] as { text: string; href: string }[]);
      log(ROLE, "info", `Create menu: ${JSON.stringify(menuItems)}`);

      // Click the "Post" entry in the create dropdown (href='#').
      const postDropdown = page.locator("a[href='#'], a[href='https://www.instagram.com/#']")
        .filter({ hasText: /post/i }).last();
      if (await postDropdown.isVisible({ timeout: 4000 }).catch(() => false)) {
        await postDropdown.click({ force: true });
        log(ROLE, "info", "Clicked Post (uploading video → becomes Reel)");
      } else {
        log(ROLE, "info", "Post dropdown item not found — proceeding to file select directly");
      }
      await page.waitForTimeout(2500);

      // Upload the VIDEO file (keeps it a reel)
      const uploadBtnPatterns = [
        /select from (computer|device)/i,
        /select (media|video|files?)/i,
        /upload (video|media|reel|files?)/i,
        /choose (file|video|media)/i,
        /^upload$/i,
      ];
      let fileSelected = false;
      for (const pat of uploadBtnPatterns) {
        const candidate = page.locator("button, [role='button']").filter({ hasText: pat }).first();
        if (await candidate.isVisible({ timeout: 3000 }).catch(() => false)) {
          log(ROLE, "info", `Clicking upload button: "${pat}"`);
          const [fc] = await Promise.all([
            page.waitForEvent("filechooser", { timeout: 15000 }),
            candidate.click(),
          ]);
          await fc.setFiles(path.resolve(mediaPath));
          fileSelected = true;
          break;
        }
      }
      if (!fileSelected) {
        const fileInput = page.locator("input[type='file']").first();
        await fileInput.setInputFiles(path.resolve(mediaPath)).catch(async () => {
          await page.screenshot({ path: `logs/debug-ig-no-upload-btn-${Date.now()}.png` }).catch(() => {});
          throw new Error("Could not find any file upload mechanism on Instagram");
        });
        log(ROLE, "info", "Video selected via hidden file input");
      }
      log(ROLE, "info", "Video selected — waiting for editor to load");
      await page.waitForTimeout(8000);
      await page.screenshot({ path: `logs/debug-ig-after-video-select-${Date.now()}.png` }).catch(() => {});

      // Dismiss any "share as reel" / processing dialog
      for (const textPat of [/^ok$/i, /share as reel/i, /continue/i, /^yes$/i]) {
        const btn = page.locator("button").filter({ hasText: textPat }).first();
        if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await btn.click({ force: true });
          log(ROLE, "info", `Dismissed post-select dialog: "${textPat}"`);
          await page.waitForTimeout(1000);
          break;
        }
      }

      // Step through wizard until caption field appears (cover/trim → filters → caption)
      // 2026-06-12: IG removed the aria-label="Write a caption" hint on their
      // contenteditable — the field now is just `div[contenteditable="true"]`
      // inside the right-panel dialog. Broaden the detector to match any
      // contenteditable in the dialog (the first such match IS the caption).
      const captionLocator = page.locator('div[role="dialog"] div[contenteditable="true"], textarea[aria-label*="caption" i], div[role="textbox"][contenteditable="true"]').first();
      for (let step = 0; step < 10; step++) {
        if (await captionLocator.isVisible().catch(() => false)) break;
        const visibleBtns = await page.evaluate(() =>
          Array.from(document.querySelectorAll("button, [role='button']"))
            .filter(el => (el as HTMLElement).offsetParent !== null)
            .map(el => el.textContent?.trim())
            .filter(t => t && t.length < 30)
            .slice(0, 10)
        ).catch(() => [] as string[]);
        log(ROLE, "info", `Wizard step ${step + 1} — visible buttons: ${visibleBtns.join(", ")}`);

        // If this step exposes a cover-upload affordance, set our branded thumbnail
        // before clicking Next. setInstagramCustomCover is silent if not at the
        // cover step yet, so this is safe to try at every step.
        if (thumbnailPath) {
          await setInstagramCustomCover(page, thumbnailPath);
        }

        const nxt = page.locator("button, div[role='button']").filter({ hasText: /^next$/i }).first();
        if (await nxt.isVisible({ timeout: 4000 }).catch(() => false)) {
          await nxt.click({ force: true });
          log(ROLE, "info", `Clicked Next at wizard step ${step + 1}`);
          await page.waitForTimeout(4000);
        } else {
          await page.waitForTimeout(3000);
        }
      }
      if (!await captionLocator.isVisible().catch(() => false)) {
        await page.screenshot({ path: `logs/debug-ig-no-caption-${Date.now()}.png` }).catch(() => {});
        log(ROLE, "warn", "Caption field not found after 10 wizard steps — screenshot saved");
      }

    } else {
      // ── Static image upload flow ──────────────────────────────────────────────
      const postBtn = page.locator("a, span, div[role='button']").filter({ hasText: /^post$/i }).first();
      await postBtn.click().catch(() => {});
      await page.waitForTimeout(2000);

      const [fileChooser] = await Promise.all([
        page.waitForEvent("filechooser", { timeout: 15000 }),
        page.locator("button").filter({ hasText: /select from (computer|device)/i }).first().click(),
      ]);
      await fileChooser.setFiles(path.resolve(mediaPath));
      log(ROLE, "info", "Image selected — waiting for crop editor");
      await page.waitForTimeout(4000);

      await clickLocatorButton(page, /^next$/i);
      await page.waitForTimeout(2000);

      await clickLocatorButton(page, /^next$/i);
      await page.waitForTimeout(2000);
    }

    // Caption (shared by both flows)
    const captionArea = page.locator(
      'div[role="dialog"] div[contenteditable="true"], textarea[aria-label*="caption" i], div[role="textbox"][contenteditable="true"], textarea[placeholder*="caption" i], textarea[placeholder*="write" i]'
    ).first();
    await captionArea.waitFor({ state: "visible", timeout: 45000 });
    log(ROLE, "info", "Caption field visible — typing caption");
    await captionArea.click();
    await page.waitForTimeout(500);
    await page.keyboard.type(caption.slice(0, 2200), { delay: 8 });
    await page.waitForTimeout(800);

    // Debug: screenshot before attempting to click Share
    await page.screenshot({ path: `logs/debug-ig-pre-share-${Date.now()}.png` }).catch(() => {});
    log(ROLE, "info", "Pre-share screenshot saved");

    // Share button — find the wizard toolbar (the bar that has BOTH Back AND Share).
    // This is more reliable than filtering by dialog role, which Instagram's wizard may not set.
    // Feed post share buttons (paper airplane) never coexist with a Back button in the same container.
    let shareClicked = false;

    const wizardToolbar = page.locator("div, header, section").filter({
      has: page.locator("button, div[role='button']").filter({ hasText: /^back$/i }),
    }).filter({
      has: page.locator("button, div[role='button']").filter({ hasText: /^share$/i }),
    }).last();

    const toolbarShareBtn = wizardToolbar
      .locator("button, div[role='button']")
      .filter({ hasText: /^share$/i })
      .first();

    if (await toolbarShareBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await toolbarShareBtn.click({ force: true });
      log(ROLE, "info", "Clicked Share button in wizard toolbar (Back+Share container)");
      shareClicked = true;
    }

    if (!shareClicked) {
      // Second attempt: dialog-scoped (role=dialog containing Back button)
      const uploadDialog = page.locator("dialog, [role='dialog']").filter({
        has: page.locator("button, div[role='button']").filter({ hasText: /^back$/i }),
      });
      const dialogShareBtn = uploadDialog
        .locator("button, div[role='button']")
        .filter({ hasText: /^share$/i })
        .first();
      if (await dialogShareBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await dialogShareBtn.click({ force: true });
        log(ROLE, "info", "Clicked Share button in upload dialog (role=dialog)");
        shareClicked = true;
      }
    }

    if (!shareClicked) {
      // Last resort: use the Share button closest to the Back button in DOM proximity.
      // Count all Share buttons for diagnostics, then pick first (wizard Share comes before feed Shares).
      for (const pattern of [/^share$/i, /^post$/i]) {
        const all = page.locator("button, div[role='button']").filter({ hasText: pattern });
        const n = await all.count().catch(() => 0);
        log(ROLE, "warn", `Share button fallback: found ${n} buttons matching ${pattern} — clicking first`);
        if (n > 0) {
          await all.first().click({ force: true });
          shareClicked = true;
          break;
        }
      }
    }

    // Poll for confirmation — polling loop is more resilient than waitForFunction.
    // waitForFunction throws immediately if the page navigates during upload (Instagram SPA),
    // which gives a false failure even when the Reel was successfully shared.
    log(ROLE, "info", "Waiting for post confirmation (polling every 5s, up to 6 min)...");
    const deadline = Date.now() + 360_000; // 6 minutes
    let confirmed = false;
    let lastStatus = "";

    while (Date.now() < deadline) {
      let text = "";
      try {
        text = await page.evaluate(() => document.body.innerText || "");
      } catch {
        // Page navigated — stay in loop, re-evaluate next tick
        await page.waitForTimeout(3000);
        continue;
      }

      if (/reel shared/i.test(text) || /your (reel|post) has been shared/i.test(text) || /post shared/i.test(text)) {
        confirmed = true;
        break;
      }

      // Detect hard errors so we don't wait the full 6 minutes unnecessarily
      if (/something went wrong/i.test(text) || /couldn.t (share|post)/i.test(text) || /try again later/i.test(text)) {
        log(ROLE, "warn", "Instagram showed an error during upload");
        break;
      }

      // Log status once per change so the log doesn't flood
      const status = /sharing/i.test(text) ? "Sharing spinner visible — still uploading" : "Waiting...";
      if (status !== lastStatus) {
        log(ROLE, "info", status);
        lastStatus = status;
      }

      await page.waitForTimeout(5000);
    }

    if (confirmed) {
      log(ROLE, "info", "Post confirmation received ✓");
    } else {
      const screenshotPath = `logs/debug-ig-confirm-${Date.now()}.png`;
      await page.screenshot({ path: screenshotPath }).catch(() => {});
      log(ROLE, "warn", `No confirmation after 6 min — screenshot: ${screenshotPath}`);
      throw new Error("Instagram post NOT confirmed — confirmation screen never appeared. Check debug screenshot.");
    }
    await page.waitForTimeout(3000);

    log(ROLE, "info", `Posted to Instagram as ${isVideo ? "Reel" : "photo"}`);
  } finally {
    await browser.close();
  }
}

// Use Playwright locator so React/JS event handlers fire (page.evaluate doesn't)
async function clickLocatorButton(page: import("playwright").Page, pattern: RegExp): Promise<void> {
  const btn = page.locator("button, div[role='button']").filter({ hasText: pattern }).first();
  await btn.click({ force: true }).catch(() => {
    log("Instagram-Browser", "warn", `Button not found: ${pattern}`);
  });
}

// ── Story posting ────────────────────────────────────────────────────────────
//
// Posts a video as an Instagram Story (24h ephemeral). Distinct from Reel — no
// caption, no music selection, no aspect-ratio dialog. Called by the scheduler
// AFTER the Reel posts successfully, so even if Story breaks the main post is
// already up. Failure here logs a warn but does NOT throw.
//
// The Story creator on IG web has a different entry point than the "+" menu:
// it's accessible via instagram.com/stories/create or by clicking the "Create"
// option in the dropdown, then "Story". We try the deep URL first.
export async function postViaInstagramStory(mediaPath: string): Promise<void> {
  const hasSession = await fs.access(SESSION_FILE).then(() => true).catch(() => false);
  const hasCookies = await fs.access(COOKIES_FILE).then(() => true).catch(() => false);
  if (!hasSession && !hasCookies) {
    throw new Error("Instagram not set up — run: python3 scripts/extract-cookies.py");
  }
  const storageState = hasSession ? SESSION_FILE : COOKIES_FILE;

  const browser = await webkit.launch({ headless: false });
  const context = await browser.newContext({
    storageState,
    viewport: { width: 1280, height: 900 },
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Safari/605.1.15",
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "platform", { get: () => "MacIntel" });
    Object.defineProperty(window, "devicePixelRatio", { get: () => 2 });
  });
  const page = await context.newPage();

  try {
    log(ROLE, "info", "Opening IG home for Story upload...");
    await page.goto("https://www.instagram.com/", { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(4000);
    if (page.url().includes("/accounts/login")) {
      throw new Error("Instagram session expired (story flow)");
    }

    // Dismiss notif prompt if shown
    await page.locator("button").filter({ hasText: /^not now$/i }).first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(800);

    // Open Create menu (same path as the Reel flow)
    const createCandidates = [
      page.locator("a[href='/create/style/']").first(),
      page.locator("a[href*='create']").first(),
      page.locator("[aria-label='Create'], [aria-label='New post']").first(),
      page.locator("[aria-label*='create' i]").first(),
      page.locator("a, div[role='button'], span[role='button']").filter({ hasText: /^create$/i }).first(),
    ];
    for (const loc of createCandidates) {
      if (await loc.isVisible({ timeout: 2500 }).catch(() => false)) {
        await loc.click({ force: true });
        break;
      }
    }
    await page.waitForTimeout(2000);

    // Click "Story" menu item (not "Post" — that goes to Reel)
    const storyClicked = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll("a, [role='menuitem'], [role='button'], span")) as HTMLElement[];
      const m = items.find(el => {
        const t = (el.innerText || el.textContent || "").trim().toLowerCase();
        return t === "story" || t === "story story" || /story/i.test(el.getAttribute("aria-label") || "");
      });
      if (m) { (m.closest("a, [role='menuitem'], [role='button']") as HTMLElement || m).click(); return true; }
      return false;
    });
    if (!storyClicked) {
      await page.screenshot({ path: `logs/debug-ig-story-menu-${Date.now()}.png` }).catch(() => {});
      throw new Error("Could not find Story option in IG Create menu");
    }
    log(ROLE, "info", "Clicked Story in Create menu");
    await page.waitForTimeout(3000);

    // File input picker — set the video
    const fileInput = page.locator('input[type="file"]').first();
    if (!await fileInput.isVisible({ timeout: 5000 }).catch(() => true)) {
      // input is often display:none; try setting anyway
    }
    await fileInput.setInputFiles(path.resolve(mediaPath));
    log(ROLE, "info", `Story media uploaded: ${mediaPath}`);
    await page.waitForTimeout(8000);
    await page.screenshot({ path: `logs/debug-ig-story-uploaded-${Date.now()}.png` }).catch(() => {});

    // Click "Share to story" / "Send" / "Add to story"
    const sent = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button, [role='button']")) as HTMLElement[];
      const m = buttons.find(b => {
        const t = (b.innerText || b.textContent || "").trim().toLowerCase();
        return t === "share to story" || t === "add to story" || t === "share" || t === "send" || t === "send to";
      });
      if (m) { m.click(); return (m.innerText || m.textContent || "").trim().slice(0, 40); }
      return null;
    });
    if (!sent) {
      await page.screenshot({ path: `logs/debug-ig-story-share-${Date.now()}.png` }).catch(() => {});
      throw new Error("Could not find Share/Send button on Story editor");
    }
    log(ROLE, "info", `Story share button clicked: "${sent}"`);
    await page.waitForTimeout(10000);
    log(ROLE, "info", "✅ Story posted (best-effort — IG doesn't always confirm)");
  } finally {
    await browser.close();
  }
}

// ── Carousel posting ─────────────────────────────────────────────────────────
//
// Posts a multi-image carousel (up to 10 images). Lower-frequency than Reels
// — call from a weekly cron, not the daily one. Carousel posts get ~1.4× the
// reach of single posts per IG's reported algorithm preference.
//
// Reuses the Reel/Post upload flow but uploads multiple files in one step and
// skips the cover-trim wizard (which is video-specific).
export async function postViaInstagramCarousel(caption: string, imagePaths: string[]): Promise<void> {
  if (imagePaths.length < 2) throw new Error("Carousel needs at least 2 images");
  if (imagePaths.length > 10) imagePaths = imagePaths.slice(0, 10);

  const hasSession = await fs.access(SESSION_FILE).then(() => true).catch(() => false);
  const hasCookies = await fs.access(COOKIES_FILE).then(() => true).catch(() => false);
  if (!hasSession && !hasCookies) {
    throw new Error("Instagram not set up — run: python3 scripts/extract-cookies.py");
  }
  const storageState = hasSession ? SESSION_FILE : COOKIES_FILE;

  const browser = await webkit.launch({ headless: false });
  const context = await browser.newContext({
    storageState,
    viewport: { width: 1280, height: 900 },
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Safari/605.1.15",
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "platform", { get: () => "MacIntel" });
    Object.defineProperty(window, "devicePixelRatio", { get: () => 2 });
  });
  const page = await context.newPage();

  try {
    await page.goto("https://www.instagram.com/", { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(4000);
    if (page.url().includes("/accounts/login")) throw new Error("IG session expired (carousel)");

    await page.locator("button").filter({ hasText: /^not now$/i }).first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(800);

    // Open Create menu
    const createCandidates = [
      page.locator("a[href='/create/style/']").first(),
      page.locator("a[href*='create']").first(),
      page.locator("[aria-label='Create'], [aria-label='New post']").first(),
      page.locator("[aria-label*='create' i]").first(),
    ];
    for (const loc of createCandidates) {
      if (await loc.isVisible({ timeout: 2500 }).catch(() => false)) {
        await loc.click({ force: true });
        break;
      }
    }
    await page.waitForTimeout(2000);

    // Click "Post" in the Create menu (multi-image upload makes it a carousel)
    await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll("a, [role='menuitem'], [role='button'], span")) as HTMLElement[];
      const m = items.find(el => /^post$/i.test((el.innerText || el.textContent || "").trim()));
      if (m) (m.closest("a, [role='menuitem'], [role='button']") as HTMLElement || m).click();
    });
    await page.waitForTimeout(3000);

    // Set ALL files at once
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(imagePaths.map(p => path.resolve(p)));
    log(ROLE, "info", `Carousel: uploaded ${imagePaths.length} images`);
    await page.waitForTimeout(8000);

    // Dismiss OK dialog if it appears
    await page.locator("button").filter({ hasText: /^ok$/i }).first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(1000);

    // Click Next twice (crop step + filter step)
    for (let i = 0; i < 2; i++) {
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll("button, [role='button']")) as HTMLElement[];
        const m = buttons.find(b => /^next$/i.test((b.innerText || b.textContent || "").trim()));
        if (m) m.click();
      });
      await page.waitForTimeout(3000);
    }

    // Caption
    const captionArea = page.locator('textarea[aria-label*="caption" i], div[role="textbox"][contenteditable="true"]').first();
    await captionArea.waitFor({ state: "visible", timeout: 30000 });
    await captionArea.click();
    await page.keyboard.type(caption.slice(0, 2200), { delay: 8 });
    await page.waitForTimeout(1500);

    // Share
    const shareClicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button, [role='button']")) as HTMLElement[];
      const m = buttons.find(b => /^share$/i.test((b.innerText || b.textContent || "").trim()));
      if (m) { m.click(); return true; }
      return false;
    });
    if (!shareClicked) throw new Error("Carousel: Share button not found");
    log(ROLE, "info", "Carousel: Share clicked, waiting for confirmation...");

    // Poll for confirmation (~3 min)
    for (let i = 0; i < 36; i++) {
      await page.waitForTimeout(5000);
      const ok = await page.evaluate(() => /your post has been shared/i.test(document.body.innerText));
      if (ok) { log(ROLE, "info", "✅ Carousel posted"); return; }
    }
    log(ROLE, "warn", "Carousel confirmation never appeared (best-effort)");
  } finally {
    await browser.close();
  }
}
