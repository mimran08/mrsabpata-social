// Quick end-to-end test: read today's news-generated archive (from cron runner workspace),
// parse it, build script-dict, and render a long video.
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { buildScriptDict } from "../utils/script-dict.js";
import { generateLongVideo, generateBackgroundPool } from "../utils/video-gen-long.js";

const PILLAR_MAP: Record<string, string> = {
  "1": "Sweden Visa & Immigration",
  "2": "Jobs & Career in Sweden",
  "3": "Real Immigrant Stories",
  "4": "Personal / Faith / Life",
};

async function main() {
  const session = process.argv[2] === "evening" ? "evening" : "morning";
  const today = new Date().toISOString().slice(0, 10);
  const archive = `/Users/imran/actions-runner/_work/mrsabpata-social/mrsabpata-social/company/daily-posts/${today}-${session}.md`;

  const md = await fs.readFile(archive, "utf-8");
  const block = (label: string) => md.match(new RegExp(`## ${label}[^\\n]*\\s+([\\s\\S]+?)---`))?.[1].trim() ?? "";
  const theme = md.match(/\*\*Theme:\*\*\s*(.+)/)?.[1].trim() ?? "";
  const pillar = md.match(/\*\*Pillar:\*\*\s*(\d)/)?.[1] ?? "1";

  const posts = {
    x: block("X / Twitter"),
    instagram: block("Instagram"),
    tiktok: block("TikTok"),
    youtube: block("YouTube Shorts"),
    stat: theme,
    subtext: "",
    pillar,
    theme,
  };

  const script = buildScriptDict(posts);
  console.log("Theme:", theme);
  console.log("Hook:", script.hook);
  console.log(`Points (${script.points.length}):`);
  script.points.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));
  console.log("Stat:", script.stat ?? "(none)");
  console.log("Action:", script.actionLine ?? "(none)");

  const pillarName = PILLAR_MAP[pillar] ?? "Sweden Visa & Immigration";
  console.log("Generating 3 backgrounds...");
  const bgPool = await generateBackgroundPool(pillarName, 3, `news-${session}-test`, "/tmp");
  console.log("Rendering...");
  const videoPath = await generateLongVideo({
    script,
    imagePath: bgPool[0],
    bgImagePaths: bgPool,
    pillar: pillarName,
    filename: `news-${session}-test`,
    outDir: "/tmp",
    pacingMode: "many-short",
  });

  console.log("✅", videoPath);
  // Try to open
  try { (await import("node:child_process")).execSync(`open "${videoPath}"`); } catch { /* ignore */ }
}

main().catch(err => { console.error(err); process.exit(1); });
