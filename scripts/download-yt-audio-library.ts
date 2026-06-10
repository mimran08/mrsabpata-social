// Drive YT Studio Audio Library with injected Safari cookies, apply filters
// (instrumental, long enough for our arc, mood matching our brand), download
// every track on the visible page, save to music/youtube-audio-library/.
//
// YT Audio Library is the only music source GUARANTEED clear for YT Shorts
// including >60s. After tonight's "Silk Road" Content ID disaster on a
// Pixabay-sourced track, we're switching the primary pool to YT-AL.
//
// Usage:
//   npx tsx scripts/download-yt-audio-library.ts [--max=20] [--moods=Bright,Calm]
import { chromium, type Page } from "playwright";
import * as fs from "node:fs/promises";
import * as path from "node:path";

const OUT_DIR = path.join("music", "youtube-audio-library");

async function loadCookies() {
  const raw = JSON.parse(await fs.readFile("company/youtube-cookies.json", "utf-8")) as { cookies: Array<{ name: string; value: string; domain: string; path: string; sameSite?: string }> };
  return raw.cookies.map(c => ({ ...c, sameSite: ["None", "Strict", "Lax"].includes(c.sameSite ?? "") ? c.sameSite : "Lax" }));
}

function arg(name: string, fallback: string): string {
  const m = process.argv.find(a => a.startsWith(`--${name}=`));
  return m ? m.split("=", 2)[1] : fallback;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

async function clickByText(page: Page, regex: RegExp, timeoutMs = 8000): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await page.evaluate((reSrc) => {
      const re = new RegExp(reSrc, "i");
      const els = Array.from(document.querySelectorAll("button, [role=button], a, tp-yt-paper-item, ytcp-button")) as HTMLElement[];
      const m = els.find(el => re.test((el.innerText || el.textContent || "").trim()) && el.offsetParent !== null);
      if (m) { m.click(); return (m.innerText || m.textContent || "").trim().slice(0, 60); }
      return null;
    }, regex.source);
    if (result) return result;
    await page.waitForTimeout(300);
  }
  return null;
}

async function main() {
  const maxDownloads = parseInt(arg("max", "25"), 10);
  console.log(`Target: up to ${maxDownloads} tracks from YT Audio Library`);
  await fs.mkdir(OUT_DIR, { recursive: true });

  const cookies = await loadCookies();
  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext({
    viewport: { width: 1500, height: 950 },
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
    acceptDownloads: true,
  });
  await ctx.addCookies(cookies as Parameters<typeof ctx.addCookies>[0]);
  const page = await ctx.newPage();

  try {
    console.log("Navigating to YT Studio Audio Library...");
    await page.goto("https://studio.youtube.com/channel/UC34evP7dIhkq3RapgALY_lA/music", { waitUntil: "domcontentloaded", timeout: 40000 });
    await page.waitForTimeout(10000);
    if (page.url().includes("/signin")) throw new Error("Studio sign-in wall — cookies didn't carry.");

    // Dismiss the "By using this audio library, you agree..." banner if present.
    await clickByText(page, /^got it$/i, 3000).catch(() => null);
    await page.waitForTimeout(2000);

    await page.screenshot({ path: "logs/yt-audio-library-loaded.png" }).catch(() => {});

    // Diagnostic: log a sample of aria-labels to understand the DOM
    const sample = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll("button[aria-label]")) as HTMLElement[];
      return {
        totalButtons: all.length,
        sampleLabels: all.slice(0, 20).map(b => b.getAttribute("aria-label")?.slice(0, 60)),
        playCount: all.filter(b => /play.*audio.*track/i.test(b.getAttribute("aria-label") || "")).length,
        downloadCount: all.filter(b => /^download$/i.test(b.getAttribute("aria-label") || "")).length,
      };
    });
    console.log(`  DOM diagnostic: ${JSON.stringify(sample, null, 2).slice(0, 600)}`);

    // Apply attribution filter — "Attribution not required" is what we want.
    // YT exposes filter chips at the top of the table.
    const filterClicked = await clickByText(page, /attribution/i, 5000);
    if (filterClicked) {
      await page.waitForTimeout(1500);
      await clickByText(page, /not required/i, 3000).catch(() => null);
      await page.waitForTimeout(2000);
      // Close filter chip
      await page.keyboard.press("Escape").catch(() => null);
    }
    await page.screenshot({ path: "logs/yt-audio-library-filtered.png" }).catch(() => {});

    // Click each Download button in order. YT exposes 30 buttons per page
    // load; we walk by index, scroll new rows into view between batches.
    // Title comes from the download event's suggestedFilename (YT names
    // each file "<Track Title>.mp3").
    const downloaded = new Set<string>();
    let scrollCount = 0;
    let nextIdx = 0;
    while (downloaded.size < maxDownloads && scrollCount < 15) {
      const total = await page.evaluate(() =>
        document.querySelectorAll("button[aria-label='Download']").length
      );
      console.log(`  Download buttons in DOM: ${total} (cursor at idx ${nextIdx})`);

      let batchDownloads = 0;
      while (nextIdx < total && downloaded.size < maxDownloads) {
        const idx = nextIdx;
        nextIdx++;
        try {
          const btn = page.locator("button[aria-label='Download']").nth(idx);
          await btn.scrollIntoViewIfNeeded({ timeout: 4000 });
          // Hover the row container first to "wake up" the Download button
          // (it's display:none until hover).
          await btn.evaluate((el) => {
            let row: HTMLElement | null = el as HTMLElement;
            for (let k = 0; k < 8 && row; k++) {
              if (row.getBoundingClientRect().height > 40) break;
              row = row.parentElement;
            }
            if (row) row.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
          });
          await page.waitForTimeout(300);

          const [download] = await Promise.all([
            page.waitForEvent("download", { timeout: 20000 }),
            btn.click({ force: true }),
          ]);
          const suggested = download.suggestedFilename();
          const title = suggested.replace(/\.mp3$/i, "");
          if (downloaded.has(title)) continue;
          const fname = `yt-${slug(title)}.mp3`;
          await download.saveAs(path.join(OUT_DIR, fname));
          downloaded.add(title);
          batchDownloads++;
          console.log(`  ✓ ${fname}  (${title})`);
          await page.waitForTimeout(500);
        } catch (e) {
          console.log(`  ⚠ idx ${idx}: ${String(e).slice(0, 90)}`);
        }
      }
      if (downloaded.size >= maxDownloads) break;
      if (batchDownloads === 0) {
        scrollCount++;
        await page.evaluate(() => window.scrollBy(0, 1500));
        await page.waitForTimeout(2500);
      }
    }

    console.log(`\nDone. ${downloaded.size} tracks downloaded → ${OUT_DIR}`);
  } finally {
    await browser.close();
  }
}

main().catch(e => { console.error("Error:", String(e).slice(0, 400)); process.exit(1); });
