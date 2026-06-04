// One-off: today's 6pm cron crashed at the Restore-sessions step (deleted
// cookie secrets in the morning cleanup). Run the full pipeline locally.

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { generatePostImage } from "../utils/image-gen.js";
import { generateLongVideo, generateBackgroundPool } from "../utils/video-gen-long.js";
import { buildScriptDict } from "../utils/script-dict.js";
import { fetchRelevantNews } from "../utils/news-fetcher.js";
import { postViaTikTok } from "../platforms/tiktok-browser.js";
import { postViaInstagram } from "../platforms/instagram-browser.js";
import { uploadYouTubeShort as uploadYouTubeShortAPI } from "../platforms/youtube-api.js";
import { log } from "../utils/logger.js";

const ROLE = "Recovery";
const STATE_DIR = process.env.MRSABPATA_STATE_DIR ?? "/Users/imran/.mrsabpata-state";

interface GroqPosts {
  x: string; instagram: string; tiktok: string; youtube: string;
  stat: string; subtext: string; theme: string; pillar: string;
}

async function generateFromNews(): Promise<GroqPosts | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  const articles = await fetchRelevantNews(12);
  if (!articles.length) return null;

  // Filter out already-posted URLs
  const dedupPath = path.join(STATE_DIR, "posted-news.json");
  let posted: Array<{ url: string; postedAt: string }> = [];
  try { posted = JSON.parse(await fs.readFile(dedupPath, "utf-8")); } catch { /* first run */ }
  const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const recentUrls = new Set(posted.filter(p => new Date(p.postedAt).getTime() > cutoff).map(p => p.url));
  const fresh = articles.filter(a => !recentUrls.has(a.url));
  if (!fresh.length) return null;

  const pick = fresh[0];
  log(ROLE, "info", `News: "${pick.title.slice(0, 70)}" (score ${pick.relevanceScore}, ${fresh.length}/${articles.length} fresh)`);

  const prompt = `You are MrSabPata — writing social media posts for Pakistanis living in Sweden.

━━━ NEWS ━━━
Title: ${pick.title}
Summary: ${pick.summary}

━━━ JOB ━━━
Write posts explaining what this means for immigrants. Practical Karachi Urdu + English mix. No filler.

━━━ FORMATS ━━━
instagram: 6-10 sentences. First line = hook. End with 6-8 hashtags.
x: MAX 240 chars. Key fact + meaning. 1 hashtag.
tiktok: Hook + 2-3 bullets. Max 150 chars. 3 hashtags.
youtube: Title (max 80 chars). 2-3 sentences. 3-5 hashtags.
stat: Big fact for image. Max 6 words, English only.
subtext: Supporting English line. Max 8 words.
theme: One-line topic.
pillar: Use "1" (visa/immigration), "2" (jobs/work), "3" (housing/life), or "4" (faith/community)

Return ONLY valid JSON:
{"x":"...","instagram":"...","tiktok":"...","youtube":"...","stat":"...","subtext":"...","theme":"...","pillar":"1"}`;

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1400, temperature: 0.7,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}`);
  const data = await res.json() as { choices: Array<{ message: { content: string } }> };
  const result = { ...JSON.parse(data.choices[0].message.content) } as GroqPosts;

  // Record URL to dedup
  posted.push({ url: pick.url, postedAt: new Date().toISOString() });
  await fs.mkdir(STATE_DIR, { recursive: true });
  await fs.writeFile(dedupPath, JSON.stringify(posted, null, 2), "utf-8");
  return result;
}

const PILLAR_NAMES: Record<string, string> = {
  "1": "Sweden Visa & Immigration",
  "2": "Jobs & Career in Sweden",
  "3": "Real Immigrant Stories",
  "4": "Personal / Faith / Life",
};

async function main() {
  log(ROLE, "info", `Today 6pm cron crashed (deleted cookie secrets) — running pipeline locally`);

  const posts = await generateFromNews();
  if (!posts) throw new Error("No fresh news + no post-bank fallback wired here");
  const pillarName = PILLAR_NAMES[posts.pillar] ?? "Sweden Visa & Immigration";
  log(ROLE, "info", `Theme: ${posts.theme} (pillar ${posts.pillar} — ${pillarName})`);

  const filename = "2026-06-04-evening-recovery";

  log(ROLE, "info", "Generating image (Pixabay bg)...");
  const img = await generatePostImage({
    stat: posts.stat || posts.theme,
    subtext: posts.subtext || "",
    pillar: pillarName,
    filename,
  });

  log(ROLE, "info", "Generating 3 backgrounds for long video...");
  const bgPool = await generateBackgroundPool(pillarName, 3, filename);

  log(ROLE, "info", "Rendering long video...");
  const script = buildScriptDict(posts);
  const videoPath = await generateLongVideo({
    script,
    imagePath: img.imagePath,
    bgImagePath: img.bgImagePath,
    bgImagePaths: bgPool.length ? bgPool : undefined,
    pillar: pillarName,
    filename,
    pacingMode: "many-short",
  });

  try {
    await postViaTikTok(posts.tiktok, videoPath);
    log(ROLE, "info", "✅ TikTok posted");
  } catch (e) { log(ROLE, "warn", `TikTok failed: ${String(e).slice(0, 200)}`); }

  try {
    await postViaInstagram(posts.instagram, videoPath);
    log(ROLE, "info", "✅ Instagram posted");
  } catch (e) { log(ROLE, "warn", `Instagram failed: ${String(e).slice(0, 200)}`); }

  try {
    const ytId = await uploadYouTubeShortAPI(posts.youtube, videoPath);
    log(ROLE, "info", `✅ YouTube: https://youtube.com/shorts/${ytId}`);
  } catch (e) { log(ROLE, "warn", `YouTube failed: ${String(e).slice(0, 200)}`); }

  const xArchive = path.join("company", "daily-posts", `${filename}.md`);
  await fs.mkdir(path.dirname(xArchive), { recursive: true });
  await fs.writeFile(xArchive, `# Recovery 2026-06-04 6pm

**Source:** cron crashed at session-restore step; ran locally
**Theme:** ${posts.theme}

## X / Twitter
${posts.x}

## New image (use for X)
${img.imagePath}
`, "utf-8");
  log(ROLE, "info", `\n📋 NEXT: post X with new image\n   image: ${img.imagePath}\n   text:  ${posts.x}\n`);
}

main().catch(err => { console.error(err); process.exit(1); });
