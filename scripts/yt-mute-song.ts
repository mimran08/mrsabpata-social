// One-off: navigate YT Studio's video editor for a specific videoId and apply
// the "Mute song" Content ID claim recovery. Uses Safari Google cookies.
//
// Usage:
//   npx tsx scripts/yt-mute-song.ts <videoId>
// Defaults to today's evening Short if no arg given.
import { chromium, type Page } from "playwright";
import * as fs from "node:fs/promises";

const DEFAULT_VIDEO_ID = "gjsOadUFwjM"; // 2026-06-10 evening — blocked for "Silk Road" match

async function loadCookies() {
  const raw = JSON.parse(await fs.readFile("company/youtube-cookies.json", "utf-8")) as { cookies: Array<{ name: string; value: string; domain: string; path: string; sameSite?: string }> };
  return raw.cookies.map(c => ({ ...c, sameSite: ["None", "Strict", "Lax"].includes(c.sameSite ?? "") ? c.sameSite : "Lax" }));
}

async function clickByText(page: Page, regex: RegExp, timeoutMs = 10000): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await page.evaluate((reSrc) => {
      const re = new RegExp(reSrc, "i");
      const els = Array.from(document.querySelectorAll("button, [role=button], a, tp-yt-paper-item, ytcp-button")) as HTMLElement[];
      const m = els.find(el => re.test((el.innerText || el.textContent || "").trim()) && el.offsetParent !== null);
      if (m) { m.click(); return (m.innerText || m.textContent || "").trim().slice(0, 80); }
      return null;
    }, regex.source);
    if (result) { console.log(`  clicked: "${result.replace(/\n/g, " ")}"`); return result; }
    await page.waitForTimeout(400);
  }
  return null;
}

async function main() {
  const videoId = process.argv[2] || DEFAULT_VIDEO_ID;
  const cookies = await loadCookies();
  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext({
    viewport: { width: 1500, height: 950 },
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  });
  await ctx.addCookies(cookies as Parameters<typeof ctx.addCookies>[0]);
  const page = await ctx.newPage();

  try {
    // Go directly to the video's Editor → Copyright section
    console.log(`Opening Studio editor for ${videoId}...`);
    await page.goto(`https://studio.youtube.com/video/${videoId}/copyright`, { waitUntil: "domcontentloaded", timeout: 40000 });
    await page.waitForTimeout(8000);
    await page.screenshot({ path: "logs/yt-mute-copyright.png" }).catch(() => {});

    if (page.url().includes("/signin")) {
      throw new Error("Studio sign-in wall — Safari cookies didn't carry.");
    }

    // The Copyright page lists the claim row. Click "Take action" — the
    // current Studio label for the row-level action button.
    const opened = await clickByText(page, /^(take action|trim or mute|select action|fix issues)$/i, 8000);
    if (!opened) throw new Error("Could not find 'Take action' button on copyright page");
    await page.waitForTimeout(3000);
    await page.screenshot({ path: "logs/yt-mute-after-action.png" }).catch(() => {});

    // Modal "Select action" — pick "Erase song" card. YT Studio's cards need a
    // REAL mouse click (custom elements ignore synthetic JS .click()). Use
    // Playwright's locator click which dispatches mousedown+mouseup+click via
    // CDP — this triggers the polymer/Lit event handler that toggles selection.
    await page.waitForTimeout(2000);
    const eraseHeading = page.getByText("Erase song", { exact: true }).first();
    await eraseHeading.waitFor({ state: "visible", timeout: 5000 });
    // Click the heading's parent row so the click target covers the actual
    // selection control. Use force so the dialog overlay doesn't intercept.
    await eraseHeading.click({ force: true });
    await page.waitForTimeout(800);
    // Selection didn't take? Try clicking the row container.
    const rowContainer = page.locator('xpath=//*[normalize-space(text())="Erase song"]/ancestor::*[self::ytcp-text-card or self::ytcp-card or self::div[@role="button"] or self::ytcp-radio-button][1]').first();
    if (await rowContainer.count() > 0) {
      await rowContainer.click({ force: true });
      console.log("Clicked row ancestor (xpath)");
    }
    await page.waitForTimeout(2000);
    await page.screenshot({ path: "logs/yt-mute-after-select.png" }).catch(() => {});

    // Continue (now enabled)
    await clickByText(page, /^continue$/i, 8000);
    await page.waitForTimeout(5000);
    await page.screenshot({ path: "logs/yt-mute-after-continue.png" }).catch(() => {});

    // Some flows show a confirmation modal — click any final action label
    await clickByText(page, /^(erase song|continue|next)$/i, 5000).catch(() => null);
    await page.waitForTimeout(3000);

    const saved = await clickByText(page, /^(save|save changes)$/i, 8000);
    console.log(saved ? `Save clicked: "${saved}"` : "No save button found — may have auto-saved");
    await page.waitForTimeout(3000);

    // Final "Confirm changes" dialog: tick the acknowledgment checkbox, then
    // click "Confirm changes". Checkbox label has "permanent" in the text.
    const ackTicked = await page.evaluate(() => {
      const labels = Array.from(document.querySelectorAll("*")) as HTMLElement[];
      const ack = labels.find(el => /acknowledge.*permanent|permanent.*acknowledge/i.test((el.innerText || el.textContent || "").trim()) && el.offsetParent !== null);
      if (!ack) return { found: false };
      // Walk up to find the actual checkbox (input[type=checkbox] OR ytcp-checkbox)
      let cur: HTMLElement | null = ack;
      for (let i = 0; i < 6 && cur; i++) {
        const cb = cur.querySelector("input[type='checkbox'], ytcp-checkbox-lit, tp-yt-paper-checkbox") as HTMLElement | null;
        if (cb) { cb.click(); return { found: true, via: cb.tagName.toLowerCase() }; }
        cur = cur.parentElement;
      }
      ack.click();
      return { found: true, via: "label-click" };
    });
    console.log(`Acknowledgment ticked: ${JSON.stringify(ackTicked)}`);
    await page.waitForTimeout(1500);

    const confirmed = await clickByText(page, /^confirm changes$/i, 8000);
    console.log(confirmed ? `Confirmed: "${confirmed}"` : "⚠ Confirm button still not clickable");
    await page.waitForTimeout(5000);
    await page.screenshot({ path: "logs/yt-mute-final.png" }).catch(() => {});
    console.log("Done. Check logs/yt-mute-final.png for final state.");
  } finally {
    await browser.close();
  }
}

main().catch(e => { console.error("Error:", String(e).slice(0, 400)); process.exit(1); });
