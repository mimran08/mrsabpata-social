// Generate 60s structured video previews from a post-bank theme.
// By default generates BOTH pacing variants side-by-side so you can pick.
//
// Usage:
//   npx tsx --env-file=.env.local scripts/preview-long-video.ts                          (both modes, today's morning theme)
//   npx tsx --env-file=.env.local scripts/preview-long-video.ts morning|evening
//   npx tsx --env-file=.env.local scripts/preview-long-video.ts "Swedish citizenship 8 year rule"
//   npx tsx --env-file=.env.local scripts/preview-long-video.ts --mode many-short
//   npx tsx --env-file=.env.local scripts/preview-long-video.ts --mode headline-detail

import { execSync } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { generateLongVideo, generateBackgroundPool, type PacingMode } from "../utils/video-gen-long.js";
import { buildScriptDict, type PostsForScript } from "../utils/script-dict.js";
import { log } from "../utils/logger.js";

const ROLE = "PreviewLong";

const CHANNEL_PILLARS: Record<string, string> = {
  "1": "Sweden Visa & Immigration",
  "2": "Jobs & Career in Sweden",
  "3": "Real Immigrant Stories",
  "4": "Personal / Faith / Life",
};

interface BankEntry {
  pillar: string;
  theme: string;
  x: string;
  instagram: string;
  tiktok: string;
  youtube: string;
  stat?: string;
  subtext?: string;
}

async function loadBank() {
  return JSON.parse(await fs.readFile(path.join("company", "post-bank.json"), "utf-8")) as {
    morning: BankEntry[];
    evening: BankEntry[];
  };
}

function pickByDayRotation(list: BankEntry[], session: "morning" | "evening"): BankEntry {
  const EPOCH = new Date("2026-01-01").getTime();
  const dayIndex = Math.floor((Date.now() - EPOCH) / (24 * 60 * 60 * 1000));
  const offset = session === "evening" ? Math.floor(list.length / 2) : 0;
  const idx = ((dayIndex + offset) % list.length + list.length) % list.length;
  return list[idx];
}

function findByTheme(all: BankEntry[], query: string): BankEntry | undefined {
  return all.find(p => p.theme.toLowerCase().includes(query.toLowerCase()));
}

async function main() {
  const args = process.argv.slice(2);
  const modeIdx = args.indexOf("--mode");
  const modeFilter = modeIdx >= 0 ? args[modeIdx + 1] as PacingMode : null;
  const themeArg = args.find(a => !a.startsWith("--") && a !== modeFilter);

  const bank = await loadBank();
  const all = [...bank.morning, ...bank.evening];

  let entry: BankEntry;
  let label: string;

  if (themeArg === "morning" || themeArg === "evening") {
    entry = pickByDayRotation(bank[themeArg], themeArg);
    label = `today-${themeArg}`;
  } else if (themeArg) {
    const found = findByTheme(all, themeArg);
    if (!found) throw new Error(`No bank entry matches "${themeArg}".`);
    entry = found;
    label = themeArg;
  } else {
    entry = pickByDayRotation(bank.morning, "morning");
    label = "today-morning";
  }

  const pillarName = CHANNEL_PILLARS[entry.pillar] ?? entry.pillar;
  log(ROLE, "info", `Theme: ${entry.theme} (pillar ${entry.pillar} — ${pillarName})`);

  const posts: PostsForScript = {
    x: entry.x, instagram: entry.instagram, tiktok: entry.tiktok, youtube: entry.youtube,
    stat: entry.stat ?? entry.theme, subtext: entry.subtext ?? "",
    pillar: entry.pillar, theme: entry.theme,
  };
  const script = buildScriptDict(posts);

  log(ROLE, "info", `Hook: ${script.hook}`);
  log(ROLE, "info", `Points (${script.points.length}):`);
  for (const [i, p] of script.points.entries()) log(ROLE, "info", `  ${i + 1}. ${p}`);
  if (script.stat) log(ROLE, "info", `Stat: ${script.stat}`);
  if (script.actionLine) log(ROLE, "info", `Action: ${script.actionLine}`);
  log(ROLE, "info", `CTA: ${script.cta}`);
  log(ROLE, "info", `Tone: ${script.tone}, Music: ${script.music_mood}`);

  const slug = (label || entry.theme).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
  const previewDir = "/tmp";

  // Generate 3 distinct backgrounds upfront — both modes share them
  log(ROLE, "info", "Generating 3 backgrounds...");
  const bgPaths = await generateBackgroundPool(pillarName, 3, `long-preview-${slug}`, previewDir);
  if (!bgPaths.length) throw new Error("All background generations failed — check Pollinations.ai connectivity");
  log(ROLE, "info", `Got ${bgPaths.length} backgrounds`);

  // Use first bg as the fallback static image (not really used since bgImagePaths is provided)
  const fallbackImg = bgPaths[0];

  const modesToRender: PacingMode[] = modeFilter ? [modeFilter] : ["many-short", "headline-detail"];
  const outputs: string[] = [];

  for (const mode of modesToRender) {
    const filename = `long-preview-${slug}-${mode}`;
    log(ROLE, "info", `Rendering [${mode}]...`);
    const videoPath = await generateLongVideo({
      script,
      imagePath: fallbackImg,
      bgImagePath: fallbackImg,
      bgImagePaths: bgPaths,
      pillar: pillarName,
      filename,
      outDir: previewDir,
      pacingMode: mode,
    });
    outputs.push(videoPath);
    log(ROLE, "info", `✅ [${mode}] ready: ${videoPath}`);
  }

  // Open all generated previews
  for (const p of outputs) {
    try { execSync(`open "${p}"`, { stdio: "ignore" }); } catch { /* fallback below */ }
  }
  log(ROLE, "info", `\nPreviews:\n${outputs.map(p => "  " + p).join("\n")}`);
}

main().catch(err => { console.error(err); process.exit(1); });
