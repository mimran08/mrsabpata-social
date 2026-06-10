// 30-day engagement audit across all 4 platforms — answers "is this working?"
// YouTube: Data API (authoritative). IG/TT/X: scraped via Safari cookies.
import { chromium } from "playwright";
import * as fs from "node:fs/promises";

const NOW = Date.parse(new Date().toISOString());
const CUTOFF_30D = NOW - 30 * 24 * 60 * 60 * 1000;

interface Stat { id: string; date?: string; title: string; views?: number; likes?: number; comments?: number; }

async function loadCookies(file: string) {
  const raw = JSON.parse(await fs.readFile(file, "utf-8")) as { cookies: Array<{ name: string; value: string; domain: string; path: string; sameSite?: string }> };
  return raw.cookies.map(c => ({ ...c, sameSite: ["None", "Strict", "Lax"].includes(c.sameSite ?? "") ? c.sameSite : "Lax" }));
}

async function withBrowser<T>(cookies: unknown, fn: (page: import("playwright").Page) => Promise<T>): Promise<T> {
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
    });
    await ctx.addCookies(cookies as Parameters<typeof ctx.addCookies>[0]);
    const page = await ctx.newPage();
    return await fn(page);
  } finally { await browser.close(); }
}

function fmt(n: number | undefined): string { return n === undefined ? "—" : n.toLocaleString(); }

async function youtube30d() {
  const apiKey = process.env.YOUTUBE_API_KEY!;
  const channelId = process.env.YOUTUBE_CHANNEL_ID!;
  if (!apiKey || !channelId) return null;

  const ch = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=statistics,snippet&id=${channelId}&key=${apiKey}`).then(r => r.json()) as { items?: Array<{ statistics: { viewCount: string; subscriberCount: string; videoCount: string } }> };
  const channelStats = ch.items?.[0]?.statistics;

  const search = await fetch(`https://www.googleapis.com/youtube/v3/search?part=id&channelId=${channelId}&maxResults=50&order=date&type=video&key=${apiKey}`).then(r => r.json()) as { items?: Array<{ id: { videoId: string } }> };
  const ids = (search.items ?? []).map(i => i.id.videoId).join(",");
  if (!ids) return { channelStats, recent30d: [] as Stat[] };

  const v = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${ids}&key=${apiKey}`).then(r => r.json()) as { items?: Array<{ id: string; snippet: { title: string; publishedAt: string }; statistics: { viewCount?: string; likeCount?: string; commentCount?: string } }> };
  const recent30d = (v.items ?? [])
    .filter(item => Date.parse(item.snippet.publishedAt) >= CUTOFF_30D)
    .map(item => ({
      id: item.id, date: item.snippet.publishedAt.slice(0, 10),
      title: item.snippet.title.slice(0, 70),
      views: Number(item.statistics.viewCount ?? 0),
      likes: Number(item.statistics.likeCount ?? 0),
      comments: Number(item.statistics.commentCount ?? 0),
    }))
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

  return { channelStats, recent30d };
}

async function ig30d() {
  const cookies = await loadCookies("company/instagram-cookies.json");
  return withBrowser(cookies, async (page) => {
    await page.goto("https://www.instagram.com/mrsabpata/reels/", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(6000);
    // Scroll a couple times to load more reels
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, 1200));
      await page.waitForTimeout(1500);
    }
    return await page.evaluate(`(function() {
      // Profile counts
      const counts = {};
      const stats = Array.from(document.querySelectorAll('header li, header span, ul li'));
      for (const s of stats) {
        const t = (s.textContent || '').trim();
        if (/posts$/i.test(t)) counts.posts = t;
        else if (/followers$/i.test(t)) counts.followers = t;
        else if (/following$/i.test(t)) counts.following = t;
      }
      // Reel grid — each link has views suffix in text
      const reels = Array.from(document.querySelectorAll('a[href*="/reel/"]'));
      const items = reels.slice(0, 30).map(function(a) {
        const text = (a.textContent || '').replace(/\\s+/g, ' ').trim();
        // text is usually like "<likes>0Boost reelView Count Icon<views>"
        const match = text.match(/([\\d.,]+[KMB]?)\\s*$/);
        const viewsStr = match ? match[1] : null;
        const id = a.href.split('/reel/')[1] ? a.href.split('/reel/')[1].split('/')[0] : '';
        return { id: id, viewsStr: viewsStr, raw: text.slice(0, 60) };
      });
      return { counts: counts, items: items };
    })()`);
  });
}

async function tiktok30d() {
  const cookies = await loadCookies("company/tiktok-cookies.json");
  return withBrowser(cookies, async (page) => {
    await page.goto("https://www.tiktok.com/@mrsabpata", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(8000);
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, 1200));
      await page.waitForTimeout(1500);
    }
    return await page.evaluate(`(function() {
      const grab = function(sel) { const el = document.querySelector(sel); return el ? (el.textContent || '').trim() : ''; };
      // Profile counts — TT data-e2e selectors
      const counts = {
        followers: grab('[data-e2e="followers-count"]'),
        following: grab('[data-e2e="following-count"]'),
        likes:     grab('[data-e2e="likes-count"]'),
      };
      // Try multiple selectors for the video grid
      const containers = Array.from(document.querySelectorAll('[data-e2e="user-post-item"], div[data-e2e="user-post-item-list"] > div'));
      const direct = Array.from(document.querySelectorAll('a[href*="/video/"]'));
      const candidates = containers.length > 0 ? containers : direct;
      const items = candidates.slice(0, 30).map(function(c) {
        const link = c.tagName === 'A' ? c : c.querySelector('a[href*="/video/"]');
        const href = link ? link.href : '';
        const id = href ? (href.split('/video/')[1] || '').split('?')[0] : '';
        // Try several view-count locations
        const viewEl = c.querySelector('[data-e2e="video-views"]') || c.querySelector('strong[data-e2e]') || c.querySelector('strong');
        const viewsStr = viewEl ? (viewEl.textContent || '').trim() : '';
        const text = (c.textContent || '').replace(/\\s+/g, ' ').trim();
        return { id: id, viewsStr: viewsStr, sample: text.slice(0, 80) };
      });
      return { counts: counts, items: items };
    })()`);
  });
}

async function x30d() {
  const cookies = await loadCookies("company/x-cookies.json");
  return withBrowser(cookies, async (page) => {
    await page.goto("https://x.com/MrSabPata", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(6000);
    for (let i = 0; i < 4; i++) {
      await page.evaluate(() => window.scrollBy(0, 1500));
      await page.waitForTimeout(1500);
    }
    return await page.evaluate(`(function() {
      const followerLinks = Array.from(document.querySelectorAll('a[href$="/verified_followers"], a[href$="/followers"]'));
      const followers = followerLinks.find(function(a) { return /follower/i.test(a.textContent || ''); });
      const arts = Array.from(document.querySelectorAll('article')).slice(0, 30);
      const items = arts.map(function(a) {
        const link = a.querySelector('a[href*="/status/"]');
        const time = a.querySelector('time');
        const text = (a.querySelector('[data-testid="tweetText"]') || {}).textContent || '';
        const groups = Array.from(a.querySelectorAll('[role="group"] [data-testid]'));
        let likes = 0, replies = 0, reposts = 0, views = 0;
        for (let i = 0; i < groups.length; i++) {
          const g = groups[i];
          const t = g.getAttribute('data-testid') || '';
          const n = parseInt((g.textContent || '').replace(/[^\\d]/g, ''), 10) || 0;
          if (t.indexOf('like') >= 0) likes = n;
          else if (t.indexOf('reply') >= 0) replies = n;
          else if (t.indexOf('retweet') >= 0 || t.indexOf('repost') >= 0) reposts = n;
          else if (t.indexOf('analytics') >= 0 || t.indexOf('impression') >= 0) views = n;
        }
        return {
          id: link ? link.href.split('/status/')[1].split('/')[0] : '',
          date: time ? time.dateTime.slice(0, 10) : '',
          text: text.slice(0, 60),
          likes: likes, replies: replies, reposts: reposts, views: views,
        };
      });
      return { followers: followers ? followers.textContent : '', items: items };
    })()`);
  });
}

function parseShortNum(s: string | undefined | null): number | null {
  if (!s) return null;
  const m = s.replace(/,/g, "").match(/^([\d.]+)\s*([KMB])?$/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const mult = ({ K: 1e3, M: 1e6, B: 1e9 } as Record<string, number>)[(m[2] || "").toUpperCase()] || 1;
  return Math.round(n * mult);
}

async function main() {
  console.log("Pulling 30-day stats across all platforms...\n");

  const [yt, ig, tt, x] = await Promise.allSettled([youtube30d(), ig30d(), tiktok30d(), x30d()]);

  // ── YouTube
  console.log("━━━ YouTube ━━━");
  if (yt.status === "fulfilled" && yt.value) {
    const cs = yt.value.channelStats!;
    console.log(`Channel:      ${fmt(Number(cs.subscriberCount))} subs · ${fmt(Number(cs.videoCount))} videos lifetime · ${fmt(Number(cs.viewCount))} views lifetime`);
    const r = yt.value.recent30d;
    const v = r.reduce((s, p) => s + (p.views ?? 0), 0);
    const l = r.reduce((s, p) => s + (p.likes ?? 0), 0);
    const c = r.reduce((s, p) => s + (p.comments ?? 0), 0);
    console.log(`Last 30d:     ${r.length} videos · ${fmt(v)} views (avg ${r.length ? Math.round(v / r.length) : 0}) · ${fmt(l)} likes · ${fmt(c)} comments`);
    if (r.length) {
      const top = r.slice().sort((a, b) => (b.views ?? 0) - (a.views ?? 0))[0];
      console.log(`Top of 30d:   ${fmt(top.views)} views · "${top.title}"`);
    }
  } else { console.log("  error:", yt.status === "rejected" ? String(yt.reason).slice(0, 120) : "no data"); }

  // ── Instagram
  console.log("\n━━━ Instagram ━━━");
  if (ig.status === "fulfilled") {
    const d = ig.value as { counts: { posts?: string; followers?: string; following?: string }; items: Array<{ id: string; viewsStr: string; raw: string }> };
    console.log(`Profile:      ${d.counts.posts ?? "?"} · ${d.counts.followers ?? "?"} · ${d.counts.following ?? "?"} following`);
    const viewedReels = d.items.filter(i => parseShortNum(i.viewsStr) !== null);
    if (viewedReels.length) {
      const views = viewedReels.map(i => parseShortNum(i.viewsStr)!).filter(n => n > 0);
      const tot = views.reduce((a, b) => a + b, 0);
      const avg = views.length ? Math.round(tot / views.length) : 0;
      const top = Math.max(...views);
      console.log(`Recent reels: ${viewedReels.length} reels parsed · total ${fmt(tot)} views · avg ${fmt(avg)} · top ${fmt(top)}`);
    } else {
      console.log("  could not extract per-reel view counts from grid");
    }
  } else { console.log("  error:", String(ig.reason).slice(0, 120)); }

  // ── TikTok
  console.log("\n━━━ TikTok ━━━");
  if (tt.status === "fulfilled") {
    const d = tt.value as { counts: { followers?: string; following?: string; likes?: string }; items: Array<{ id: string; viewsStr: string; sample: string }> };
    console.log(`Profile:      ${d.counts.followers || "?"} followers · ${d.counts.likes || "?"} lifetime likes · ${d.counts.following || "?"} following`);
    const parsed = d.items.map(i => ({ id: i.id, views: parseShortNum(i.viewsStr) ?? 0, sample: i.sample })).filter(i => i.id);
    const viewed = parsed.filter(i => i.views > 0);
    if (viewed.length) {
      const tot = viewed.reduce((a, b) => a + b.views, 0);
      const avg = Math.round(tot / viewed.length);
      const top = Math.max(...viewed.map(i => i.views));
      console.log(`Recent videos: ${viewed.length} parsed · total ${fmt(tot)} views · avg ${fmt(avg)} · top ${fmt(top)}`);
    } else {
      console.log(`  ${parsed.length} videos in grid but no view counts parsed — TT selectors likely changed`);
      if (parsed.length) console.log("  sample:", parsed[0].sample);
    }
  } else { console.log("  error:", String(tt.reason).slice(0, 120)); }

  // ── X
  console.log("\n━━━ X ━━━");
  if (x.status === "fulfilled") {
    const d = x.value as { followers: string; items: Array<{ id: string; date: string; text: string; likes: number; replies: number; reposts: number; views: number }> };
    console.log(`Profile:      ${d.followers || "?"}`);
    const last30 = d.items.filter(i => i.date && Date.parse(i.date) >= CUTOFF_30D);
    if (last30.length) {
      const tot = last30.reduce((s, p) => s + p.views, 0);
      const totLikes = last30.reduce((s, p) => s + p.likes, 0);
      console.log(`Last 30d:     ${last30.length} tweets · ${fmt(tot)} views · ${fmt(totLikes)} likes (X view counts often blank for non-premium)`);
    } else {
      console.log("  no posts dated within last 30d (or dates missing)");
    }
    console.log("  Most recent 5:");
    for (const t of d.items.slice(0, 5)) {
      console.log(`    ${t.date || "?"}  v=${String(t.views).padStart(5)}  ♥=${String(t.likes).padStart(3)}  ${t.text}`);
    }
  } else { console.log("  error:", String(x.reason).slice(0, 120)); }
}

void main();
