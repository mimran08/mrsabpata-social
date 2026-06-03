// One-off recovery: re-post today's morning with the "Swedish citizenship 8 year rule"
// theme (post-bank index 2) after deleting the original duplicate-news post.
// Skips X (manual). Targets TikTok, Instagram, YouTube.

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { generatePostImage } from "../utils/image-gen.js";
import { generateAnimatedVideo } from "../utils/video-gen-animated.js";
import { postViaTikTok } from "../platforms/tiktok-browser.js";
import { postViaInstagram } from "../platforms/instagram-browser.js";
import { uploadYouTubeShort as uploadYouTubeShortAPI } from "../platforms/youtube-api.js";
import { log } from "../utils/logger.js";

const ROLE = "Recovery";

async function main() {
  const bankRaw = await fs.readFile(path.join("company", "post-bank.json"), "utf-8");
  const bank = JSON.parse(bankRaw) as {
    morning: Array<{ pillar: string; theme: string; x: string; instagram: string; tiktok: string; youtube: string; stat?: string; subtext?: string }>;
  };

  // Locate the citizenship entry explicitly (not by index, in case bank changes)
  const post = bank.morning.find(p => /citizenship.*8.*year/i.test(p.theme));
  if (!post) throw new Error("Citizenship entry not found in post-bank");
  log(ROLE, "info", `Theme: ${post.theme}`);

  const pillarName = "Sweden Visa & Immigration";
  const filename = `${new Date().toISOString().slice(0, 10)}-morning-recovery`;

  // Image
  const stat = post.stat ?? "Citizenship now 8 years";
  const subtext = post.subtext ?? "6 June 2026 effective";
  log(ROLE, "info", "Generating image...");
  const img = await generatePostImage({ stat, subtext, pillar: pillarName, filename });
  log(ROLE, "info", `Image: ${img.imagePath}`);

  // Video
  log(ROLE, "info", "Generating animated video...");
  const videoPath = await generateAnimatedVideo({
    imagePath: img.imagePath,
    bgImagePath: img.bgImagePath,
    stat, subtext, pillar: pillarName,
    filename,
    musicMood: "cultural",
  });
  log(ROLE, "info", `Video: ${videoPath}`);

  // TikTok
  try {
    await postViaTikTok(post.tiktok, videoPath);
    log(ROLE, "info", "✅ TikTok posted");
  } catch (e) { log(ROLE, "warn", `TikTok failed: ${String(e).slice(0, 200)}`); }

  // Instagram
  try {
    await postViaInstagram(post.instagram, videoPath);
    log(ROLE, "info", "✅ Instagram posted");
  } catch (e) { log(ROLE, "warn", `Instagram failed: ${String(e).slice(0, 200)}`); }

  // YouTube
  try {
    await uploadYouTubeShortAPI(post.youtube, videoPath);
    log(ROLE, "info", "✅ YouTube uploaded");
  } catch (e) { log(ROLE, "warn", `YouTube failed: ${String(e).slice(0, 200)}`); }

  // Archive the X text (manual post)
  const archive = `# Morning Recovery — ${new Date().toISOString().slice(0, 10)}

**Source:** Post bank (citizenship 8-year — replaces deleted duplicate)
**Pillar:** 1 — ${pillarName}
**Theme:** ${post.theme}

---

## X / Twitter (post manually)

${post.x}

---

## Instagram

${post.instagram}

---

## TikTok

${post.tiktok}

---

## YouTube Shorts

${post.youtube}
`;
  await fs.writeFile(path.join("company", "daily-posts", `${new Date().toISOString().slice(0, 10)}-morning-recovery.md`), archive, "utf-8");
  log(ROLE, "info", "Archived recovery post");
}

main().catch(err => { console.error(err); process.exit(1); });
