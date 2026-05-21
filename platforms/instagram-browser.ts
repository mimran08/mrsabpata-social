import { webkit } from "playwright";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { log } from "../utils/logger.js";

const ROLE = "Instagram-Browser";
const SESSION_FILE = path.join("company", "instagram-session.json");
const COOKIES_FILE = path.join("company", "instagram-cookies.json");

// Posts a video as an Instagram Reel (falls back to image if not mp4/mov)
export async function postViaInstagram(caption: string, mediaPath: string): Promise<void> {
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
      const captionLocator = page.locator('textarea[aria-label*="caption" i], div[role="textbox"][contenteditable="true"]').first();
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
      'textarea[aria-label*="caption" i], div[role="textbox"][contenteditable="true"], textarea[placeholder*="caption" i], textarea[placeholder*="write" i]'
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
