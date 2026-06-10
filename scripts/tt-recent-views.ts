// TikTok deep-dive: the profile grid stopped exposing view counts, so visit
// each recent video URL directly and read the view counter from the detail page.
import { chromium, type Page } from "playwright";
import * as fs from "node:fs/promises";

async function loadCookies() {
  const raw = JSON.parse(await fs.readFile("company/tiktok-cookies.json", "utf-8")) as { cookies: Array<{ name: string; value: string; domain: string; path: string; sameSite?: string }> };
  return raw.cookies.map(c => ({ ...c, sameSite: ["None", "Strict", "Lax"].includes(c.sameSite ?? "") ? c.sameSite : "Lax" }));
}

async function getVideoUrls(page: Page): Promise<string[]> {
  await page.goto("https://www.tiktok.com/@mrsabpata", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(7000);
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => window.scrollBy(0, 1500));
    await page.waitForTimeout(1500);
  }
  return await page.evaluate(`(function() {
    const links = Array.from(document.querySelectorAll('a[href*="/@mrsabpata/video/"]'));
    const urls = Array.from(new Set(links.map(function(a) { return a.href.split('?')[0]; })));
    return urls.slice(0, 20);
  })()`);
}

async function getVideoStats(page: Page, url: string) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(5000);
  return await page.evaluate(`(function() {
    const grab = function(sel) { const el = document.querySelector(sel); return el ? (el.textContent || '').trim() : ''; };
    const date = (function() {
      const t = document.querySelector('[data-e2e="browser-nickname"] span:last-child, [data-e2e="video-create-time"]');
      return t ? (t.textContent || '').trim() : '';
    })();
    const desc = grab('[data-e2e="browse-video-desc"]') || grab('[data-e2e="video-desc"]');
    return {
      url: location.href,
      views: grab('[data-e2e="video-views"]') || grab('strong[data-e2e="like-count"]'),
      likes: grab('[data-e2e="like-count"]'),
      comments: grab('[data-e2e="comment-count"]'),
      shares: grab('[data-e2e="share-count"]'),
      date: date,
      desc: (desc || '').slice(0, 60),
    };
  })()`);
}

function parseShort(s: string): number | null {
  if (!s) return null;
  const m = s.replace(/,/g, "").match(/^([\d.]+)\s*([KMB])?$/i);
  if (!m) return null;
  return Math.round(parseFloat(m[1]) * (({ K: 1e3, M: 1e6, B: 1e9 } as Record<string, number>)[(m[2] || "").toUpperCase()] || 1));
}

async function main() {
  const cookies = await loadCookies();
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  });
  await ctx.addCookies(cookies as Parameters<typeof ctx.addCookies>[0]);
  const page = await ctx.newPage();

  console.log("Fetching recent TikTok video URLs...");
  const urls = await getVideoUrls(page);
  console.log(`  found ${urls.length}\n`);

  const stats: Array<{ url: string; views: string; likes: string; comments: string; shares: string; date: string; desc: string }> = [];
  for (let i = 0; i < Math.min(15, urls.length); i++) {
    process.stdout.write(`  [${i + 1}/${Math.min(15, urls.length)}] `);
    try {
      const s = (await getVideoStats(page, urls[i])) as { url: string; views: string; likes: string; comments: string; shares: string; date: string; desc: string };
      stats.push(s);
      console.log(`v=${s.views || "?"} ♥=${s.likes || "?"} 💬=${s.comments || "?"}`);
    } catch (e) {
      console.log("error:", String(e).slice(0, 60));
    }
  }
  await browser.close();

  // Summary
  const viewsNum = stats.map(s => parseShort(s.views) || 0).filter(n => n > 0);
  if (viewsNum.length) {
    const total = viewsNum.reduce((a, b) => a + b, 0);
    const avg = Math.round(total / viewsNum.length);
    const top = Math.max(...viewsNum);
    console.log(`\n━━━ Summary (last ${stats.length} videos) ━━━`);
    console.log(`  Views:    total ${total.toLocaleString()} · avg ${avg} · top ${top}`);
    const totalLikes = stats.map(s => parseShort(s.likes) || 0).reduce((a, b) => a + b, 0);
    console.log(`  Likes:    total ${totalLikes}`);
    const topVid = stats.find(s => parseShort(s.views) === top);
    if (topVid) console.log(`  Top:      "${topVid.desc}"`);
  } else {
    console.log("\nNo views parsed — sample raw:", JSON.stringify(stats[0] ?? "no stats"));
  }
}

void main();
