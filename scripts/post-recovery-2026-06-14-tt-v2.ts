// V2 of TT recovery: bypass the click→filechooser flow (which times out on
// current TT Studio) and setInputFiles directly on the hidden video input
// that TT pre-renders on the upload page.
import { chromium, type Page } from "playwright";
import * as fs from "node:fs/promises";
import * as path from "node:path";

const RUNNER = "/Users/imran/actions-runner/_work/mrsabpata-social/mrsabpata-social";
const VIDEO = `${RUNNER}/company/post-videos/2026-06-14-evening.mp4`;
const THUMB = `${RUNNER}/company/post-images/2026-06-14-evening-thumb.png`;
const ARCHIVE = `${RUNNER}/company/daily-posts/2026-06-14-evening.md`;
const COOKIES = "company/tiktok-cookies.json";

async function readCaption() {
  const md = await fs.readFile(ARCHIVE, "utf-8");
  const m = md.match(/## TikTok\s*\n+([\s\S]*?)\n+---/);
  if (!m) throw new Error("TT caption not found");
  return m[1].trim();
}

async function dismissJoyride(page: Page) {
  for (let i = 0; i < 5; i++) {
    const gone = await page.evaluate(() => {
      const portal = document.querySelector("#react-joyride-portal");
      if (!portal) return true;
      const btn = portal.querySelector("button");
      if (btn) { btn.click(); return false; }
      return false;
    });
    if (gone) return;
    await page.waitForTimeout(600);
  }
}

async function main() {
  const caption = await readCaption();
  console.log(`Caption: ${caption.length} chars`);

  const localVideo = path.join("company", "post-videos", "2026-06-14-evening.mp4");
  await fs.mkdir(path.dirname(localVideo), { recursive: true });
  await fs.access(localVideo).catch(async () => fs.copyFile(VIDEO, localVideo));

  const localThumb = path.join("company", "post-images", "2026-06-14-evening-thumb.png");
  await fs.mkdir(path.dirname(localThumb), { recursive: true });
  await fs.access(localThumb).catch(async () => fs.copyFile(THUMB, localThumb));

  const raw = JSON.parse(await fs.readFile(COOKIES, "utf-8")) as { cookies: Array<{ name: string; value: string; domain: string; path: string; sameSite?: string }> };
  const cookies = raw.cookies.map(c => ({ ...c, sameSite: ["None","Strict","Lax"].includes(c.sameSite ?? "") ? c.sameSite : "Lax" }));

  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addCookies(cookies as Parameters<typeof ctx.addCookies>[0]);
  const page = await ctx.newPage();
  const deadline = Date.now() + 7 * 60 * 1000;

  try {
    console.log("[1] TT Studio upload");
    await page.goto("https://www.tiktok.com/tiktokstudio/upload?from=upload", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(8000);
    if (page.url().includes("/login")) throw new Error("Session expired");

    console.log("[2] setInputFiles directly on hidden file input");
    const fileInput = page.locator("input[type='file'][accept*='video']").first();
    await fileInput.setInputFiles(path.resolve(localVideo));
    console.log("    upload kicked off");
    await page.waitForTimeout(5000);
    await dismissJoyride(page);

    console.log("[2b] Wait for the top-right Cancel button to disappear (signals upload done)");
    for (let i = 0; i < 240 && Date.now() < deadline; i++) {
      const state = await page.evaluate(() => {
        const text = document.body.innerText;
        const pct = text.match(/(\d+(?:\.\d+)?)\s*%/)?.[1] || null;
        const hasCancel = !!(Array.from(document.querySelectorAll("button, [role='button']")) as HTMLElement[])
          .find(b => /^cancel$/i.test((b.textContent || "").trim()) && b.offsetParent !== null);
        return { pct, hasCancel };
      });
      if (!state.hasCancel) { console.log(`    Cancel button gone after ${i*2}s — upload finished`); break; }
      if (i % 4 === 0) console.log(`    still uploading: ${state.pct ?? "?"}%`);
      await page.waitForTimeout(2000);
    }
    await page.waitForTimeout(4000);
    await dismissJoyride(page);

    console.log("[3] Caption — clear + type");
    const captionEl = page.locator('[contenteditable="true"]').first();
    await captionEl.waitFor({ state: "visible", timeout: 20000 });
    await captionEl.click({ force: true });
    await page.waitForTimeout(400);
    await page.keyboard.press(process.platform === "darwin" ? "Meta+a" : "Control+a");
    await page.keyboard.press("Backspace");
    await page.waitForTimeout(200);
    await page.keyboard.type(caption.slice(0, 2200), { delay: 8 });
    await page.waitForTimeout(800);
    await page.keyboard.press("Escape");
    await page.mouse.click(10, 10);
    await page.waitForTimeout(500);
    await dismissJoyride(page);

    console.log("[4] Wait for Post button enabled");
    await page.waitForFunction(() => {
      const btn = Array.from(document.querySelectorAll("button"))
        .find(b => /^(post|publish)$/i.test(b.textContent?.trim() || ""));
      return btn && btn.getAttribute("aria-disabled") !== "true" && !btn.disabled;
    }, { timeout: 60000 }).catch(() => null);

    console.log("[5] Click Post — up to 4 retries");
    let published = false;
    for (let attempt = 1; attempt <= 4 && !published && Date.now() < deadline; attempt++) {
      await dismissJoyride(page);
      await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll("button"))
          .find(b => /^(post|publish)$/i.test(b.textContent?.trim() || ""));
        btn?.click();
      });
      published = await page.waitForURL(/tiktokstudio\/content/, { timeout: 25000 }).then(() => true).catch(() => false);
      if (!published) console.log(`    attempt ${attempt}: no redirect to /content`);
    }
    if (!published) {
      await page.screenshot({ path: `logs/tt-recovery-failed-${Date.now()}.png` });
      throw new Error("TT post did not publish after 4 attempts");
    }
    console.log("✅ TT posted (confirmed redirect to /content)");
  } finally {
    await browser.close();
  }
}

main().catch(e => { console.error("Error:", String(e).slice(0, 400)); process.exit(1); });
