// One-off recovery: re-post today's evening with "Pre-departure checklist Pakistan to Sweden"
// (post-bank evening idx 9) after deleting the duplicate-news evening post.
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
  const bank = JSON.parse(await fs.readFile(path.join("company", "post-bank.json"), "utf-8")) as {
    evening: Array<{ pillar: string; theme: string; x: string; instagram: string; tiktok: string; youtube: string; stat?: string; subtext?: string }>;
  };
  const post = bank.evening.find(p => /pre.?departure.*checklist/i.test(p.theme));
  if (!post) throw new Error("Pre-departure entry not found in evening bank");
  log(ROLE, "info", `Theme: ${post.theme}`);

  const pillarName = "Personal / Faith / Life";
  const filename = `${new Date().toISOString().slice(0, 10)}-evening-recovery`;

  const stat = post.stat ?? "Pre-departure checklist";
  const subtext = post.subtext ?? "Pakistan to Sweden";
  log(ROLE, "info", "Generating image...");
  const img = await generatePostImage({ stat, subtext, pillar: pillarName, filename });
  log(ROLE, "info", `Image: ${img.imagePath}`);

  log(ROLE, "info", "Generating animated video...");
  const videoPath = await generateAnimatedVideo({
    imagePath: img.imagePath,
    bgImagePath: img.bgImagePath,
    stat, subtext, pillar: pillarName,
    filename,
    musicMood: "cultural",
  });
  log(ROLE, "info", `Video: ${videoPath}`);

  try {
    await postViaTikTok(post.tiktok, videoPath);
    log(ROLE, "info", "✅ TikTok posted");
  } catch (e) { log(ROLE, "warn", `TikTok failed: ${String(e).slice(0, 200)}`); }

  try {
    await postViaInstagram(post.instagram, videoPath);
    log(ROLE, "info", "✅ Instagram posted");
  } catch (e) { log(ROLE, "warn", `Instagram failed: ${String(e).slice(0, 200)}`); }

  try {
    await uploadYouTubeShortAPI(post.youtube, videoPath);
    log(ROLE, "info", "✅ YouTube uploaded");
  } catch (e) { log(ROLE, "warn", `YouTube failed: ${String(e).slice(0, 200)}`); }

  const archive = `# Evening Recovery — ${new Date().toISOString().slice(0, 10)}

**Source:** Post bank (pre-departure checklist — replaces deleted duplicate)
**Pillar:** ${post.pillar} — ${pillarName}
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
  await fs.writeFile(path.join("company", "daily-posts", `${new Date().toISOString().slice(0, 10)}-evening-recovery.md`), archive, "utf-8");
  log(ROLE, "info", "Archived recovery post");
}

main().catch(err => { console.error(err); process.exit(1); });
