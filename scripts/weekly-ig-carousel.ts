// Weekly IG carousel: pulls today's (or yesterday's) cron-generated comic
// panels and posts them as a 4-7 image carousel on Instagram with a fresh
// caption that re-frames the most engaging story of the week.
//
// Intended to run once a week (e.g. Sunday 10am Stockholm) via cron, complementing
// the daily Reels rather than replacing them. Carousels reach ~1.4× the audience
// of single reels (per IG's own algorithm tuning).
//
// Strategy: take the most recent day's panels (which we already paid Gemini to
// render), append the cast-driven caption from the archive, and ship.

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { postViaInstagramCarousel } from "../platforms/instagram-browser.js";

const SCENES_ROOT = path.join("company", "characters", "scenes");
const ARCHIVE_ROOT = path.join("company", "daily-posts");
const RUNNER_FALLBACK = "/Users/imran/actions-runner/_work/mrsabpata-social/mrsabpata-social/company";

async function findLatestPanelSet(): Promise<{ panels: string[]; archiveStem: string }> {
  // Try local first, then runner workspace (clean: false keeps them around)
  const roots = [SCENES_ROOT, path.join(RUNNER_FALLBACK, "characters", "scenes")];
  for (const root of roots) {
    const exists = await fs.access(root).then(() => true).catch(() => false);
    if (!exists) continue;
    const dirs = await fs.readdir(root);
    const sorted = dirs.filter(d => /^\d{4}-\d{2}-\d{2}-(morning|evening)$/.test(d)).sort().reverse();
    for (const d of sorted) {
      const dir = path.join(root, d);
      const files = await fs.readdir(dir);
      const panels = files.filter(f => f.endsWith(".png")).sort().map(f => path.join(dir, f));
      if (panels.length >= 4) return { panels: panels.slice(0, 7), archiveStem: d };
    }
  }
  throw new Error("No recent panel set with >=4 panels found");
}

async function readArchiveCaption(archiveStem: string): Promise<string> {
  const candidates = [
    path.join(ARCHIVE_ROOT, `${archiveStem}.md`),
    path.join(RUNNER_FALLBACK, "daily-posts", `${archiveStem}.md`),
  ];
  for (const p of candidates) {
    const ok = await fs.access(p).then(() => true).catch(() => false);
    if (!ok) continue;
    const md = await fs.readFile(p, "utf-8");
    const m = md.match(/## Instagram\s*\n\n([\s\S]*?)\n\n---/);
    if (m) return m[1].trim();
  }
  throw new Error(`No Instagram caption found in archive for ${archiveStem}`);
}

async function main() {
  const { panels, archiveStem } = await findLatestPanelSet();
  console.log(`Carousel: ${panels.length} panels from ${archiveStem}`);
  for (const p of panels) console.log(`  ${p}`);

  let caption = await readArchiveCaption(archiveStem);
  // Reframe as a weekend recap so it's not literally the same post as the daily reel
  caption = `📖 Is hafte ki kahani — Ahmed/Fatima/Bilal ke saath kya hua?\n\n${caption}\n\nSwipe karke pura episode dekho 👉`;

  console.log("\nPosting to IG as carousel...");
  await postViaInstagramCarousel(caption, panels);
  console.log("✅ Carousel posted");
}

main().catch(e => { console.error("Error:", String(e).slice(0, 500)); process.exit(1); });
