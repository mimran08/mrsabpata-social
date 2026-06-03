import sharp from "sharp";
import * as https from "node:https";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { execSync } from "node:child_process";

// ─── MrSabPata post image generator ──────────────────────────────────────────
// Produces a 1080×1080 branded image (works for X, Instagram, YouTube Shorts thumbnail)
// Design: AI-generated background (Pollinations.ai FLUX) + branded text overlay

const W = 1080;
const H = 1080;

// Brand palette
const ACCENT  = "#F4D03F";   // warm yellow — pops on dark
const WHITE   = "#FFFFFF";
const SUBTEXT = "#B2DFDB";   // soft teal
const BG_TOP  = "#0D1B2A";   // fallback bg navy
const BG_BTM  = "#1B4332";   // fallback bg green

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length > maxChars && current) {
      lines.push(current.trim());
      current = word;
    } else {
      current = (current + " " + word).trim();
    }
  }
  if (current) lines.push(current.trim());
  return lines;
}

// Shrinks font until the longest line fits within maxWidth (pixels).
// charWidthRatio: Arial Black ~0.62, Arial ~0.55. Safe margin already baked in.
function fitFontSize(lines: string[], maxWidth: number, startSize: number, minSize: number, charWidthRatio = 0.62): number {
  const longest = Math.max(0, ...lines.map(l => l.length));
  let size = startSize;
  while (size > minSize && longest * size * charWidthRatio > maxWidth) {
    size -= 4;
  }
  return size;
}

function seedFromFilename(filename: string): number {
  let hash = 0;
  for (let i = 0; i < filename.length; i++) {
    hash = ((hash << 5) - hash + filename.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 99999;
}

// Per-pillar Pixabay search keywords. Real-photo queries that return vertical
// or large landscape stock matching the brand mood. Multiple keywords per pillar
// so different `seed` values can pick different queries → genuinely different visuals.
const PILLAR_PIXABAY_KEYWORDS: Record<string, string[]> = {
  "Sweden Visa & Immigration":  ["stockholm night", "stockholm architecture", "scandinavia landscape", "swedish flag", "nordic skyline"],
  "Work & Visa in Sweden":      ["stockholm night", "scandinavia landscape", "swedish architecture", "nordic skyline"],
  "Jobs & Career in Sweden":    ["stockholm office", "nordic business", "modern workplace", "scandinavian design", "stockholm skyline"],
  "Real Immigrant Stories":     ["stockholm street", "scandinavian city", "nordic people", "swedish culture", "stockholm dusk"],
  "Personal / Faith / Life":    ["swedish forest", "scandinavian nature", "nordic landscape", "stockholm sunset", "scandinavian winter"],
  "Faith & Life in Sweden":     ["swedish forest", "scandinavian nature", "nordic landscape", "stockholm sunset", "scandinavian winter"],
};

interface PixabayHit {
  largeImageURL: string;
  imageWidth: number;
  imageHeight: number;
}

// Fetch a single CC0 image from Pixabay's API. Picks a query keyword from the
// pillar-specific list using `seed` so different seeds give different visuals.
async function downloadPixabayBackground(pillar: string, seed: number): Promise<Buffer> {
  const apiKey = process.env.PIXABAY_API_KEY;
  if (!apiKey) throw new Error("PIXABAY_API_KEY not set");

  const keywords = PILLAR_PIXABAY_KEYWORDS[pillar]
    ?? ["stockholm", "scandinavia", "nordic landscape"];
  const keyword = keywords[seed % keywords.length];

  // Pull a page that's offset by seed so we get different hits across calls.
  // Pixabay max per_page=200 but we only need ~20; use offset via page number.
  const page = ((Math.floor(seed / keywords.length)) % 4) + 1;
  const searchUrl = `https://pixabay.com/api/?key=${apiKey}&q=${encodeURIComponent(keyword)}&orientation=vertical&image_type=photo&safesearch=true&per_page=20&page=${page}`;

  const searchRes = await fetch(searchUrl);
  if (!searchRes.ok) throw new Error(`Pixabay search HTTP ${searchRes.status}`);
  const data = await searchRes.json() as { hits: PixabayHit[] };
  if (!data.hits.length) throw new Error(`Pixabay returned 0 hits for "${keyword}"`);

  // Pick a specific hit deterministically from seed so repeat runs are reproducible
  const hit = data.hits[seed % data.hits.length];

  // Download the image bytes
  return new Promise((resolve, reject) => {
    https.get(hit.largeImageURL, res => {
      if (res.statusCode !== 200) return reject(new Error(`Pixabay CDN HTTP ${res.statusCode}`));
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("error", reject).setTimeout(20000, function (this: import("node:http").ClientRequest) { this.destroy(); reject(new Error("Pixabay CDN timeout")); });
  });
}

// CC0 photo backgrounds from Pixabay Images API.
// (Previously fell back to Pollinations.ai when Pixabay failed, but Pollinations
// started returning HTTP 402 on 2026-06-03 — the fallback was never useful so
// we dropped it. If Pixabay fails, video-gen-long.ts handles it by cycling
// whatever single image was passed in.)
export async function downloadAIBackground(pillar: string, seed: number): Promise<Buffer> {
  return downloadPixabayBackground(pillar, seed);
}

export interface PostImageOptions {
  // The big stat / hook — keep under ~40 chars for best readability
  stat: string;
  // Supporting line (shorter context — 1 line ideal)
  subtext?: string;
  // Pillar label e.g. "Sweden Visa & Immigration"
  pillar: string;
  // Output directory (defaults to company/post-images/)
  outDir?: string;
  // Filename stem (defaults to YYYY-MM-DD-session)
  filename?: string;
}

function buildTextOverlaySvg(opts: PostImageOptions): string {
  const statLines = wrapText(opts.stat, 20);
  const subtextLines = opts.subtext ? wrapText(opts.subtext, 34) : [];

  const startSize = statLines.length <= 2 ? 96 : 76;
  const statFontSize = fitFontSize(statLines, 940, startSize, 40);
  const statLineHeight = statFontSize * 1.2;
  const statBlockHeight = statLines.length * statLineHeight;
  const subtextFontSize = 36;
  const subtextLineHeight = subtextFontSize * 1.4;
  const subtextBlockHeight = subtextLines.length * subtextLineHeight + (subtextLines.length ? 40 : 0);
  const totalContentHeight = statBlockHeight + subtextBlockHeight;
  const contentStartY = 220 + (560 - totalContentHeight) / 2;

  const statSvgLines = statLines.map((line, i) => {
    const y = contentStartY + i * statLineHeight + statFontSize;
    return `<text x="540" y="${y}" font-family="Arial Black, Arial, sans-serif" font-size="${statFontSize}" font-weight="900" fill="${ACCENT}" text-anchor="middle" letter-spacing="1">${escapeXml(line)}</text>`;
  }).join("\n    ");

  const subtextStartY = contentStartY + statBlockHeight + 40;
  const subtextSvgLines = subtextLines.map((line, i) => {
    const y = subtextStartY + i * subtextLineHeight + subtextFontSize;
    return `<text x="540" y="${y}" font-family="Arial, sans-serif" font-size="${subtextFontSize}" fill="${SUBTEXT}" text-anchor="middle">${escapeXml(line)}</text>`;
  }).join("\n    ");

  const pillarLabel = escapeXml(opts.pillar.toUpperCase());

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="accentBar" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${ACCENT}" stop-opacity="0"/>
      <stop offset="30%" stop-color="${ACCENT}"/>
      <stop offset="70%" stop-color="${ACCENT}"/>
      <stop offset="100%" stop-color="${ACCENT}" stop-opacity="0"/>
    </linearGradient>
    <!-- Dark vignette top/bottom for text readability -->
    <linearGradient id="topFade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0D1B2A" stop-opacity="0.85"/>
      <stop offset="28%" stop-color="#0D1B2A" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="bottomFade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="72%" stop-color="#0D1B2A" stop-opacity="0"/>
      <stop offset="100%" stop-color="#0D1B2A" stop-opacity="0.85"/>
    </linearGradient>
  </defs>

  <!-- Mid overlay for text readability -->
  <rect width="${W}" height="${H}" fill="rgba(0,0,0,0.45)"/>
  <!-- Vignette edges -->
  <rect width="${W}" height="${H}" fill="url(#topFade)"/>
  <rect width="${W}" height="${H}" fill="url(#bottomFade)"/>

  <!-- Decorative corner accents -->
  <rect x="40" y="40" width="80" height="6" fill="${ACCENT}" opacity="0.8"/>
  <rect x="40" y="40" width="6" height="80" fill="${ACCENT}" opacity="0.8"/>
  <rect x="${W-120}" y="40" width="80" height="6" fill="${ACCENT}" opacity="0.8"/>
  <rect x="${W-46}" y="40" width="6" height="80" fill="${ACCENT}" opacity="0.8"/>
  <rect x="40" y="${H-46}" width="80" height="6" fill="${ACCENT}" opacity="0.8"/>
  <rect x="40" y="${H-120}" width="6" height="80" fill="${ACCENT}" opacity="0.8"/>
  <rect x="${W-120}" y="${H-46}" width="80" height="6" fill="${ACCENT}" opacity="0.8"/>
  <rect x="${W-46}" y="${H-120}" width="6" height="80" fill="${ACCENT}" opacity="0.8"/>

  <!-- Top: channel name -->
  <text x="540" y="120" font-family="Arial, sans-serif" font-size="42" font-weight="bold" fill="${WHITE}" text-anchor="middle" opacity="0.95">MrSabPata</text>

  <!-- Pillar label -->
  <text x="540" y="168" font-family="Arial, sans-serif" font-size="22" fill="${ACCENT}" text-anchor="middle" opacity="0.85" letter-spacing="3">${pillarLabel}</text>

  <!-- Divider line -->
  <rect x="180" y="190" width="720" height="2" fill="url(#accentBar)" opacity="0.7"/>

  <!-- Main stat / hook text -->
  ${statSvgLines}

  <!-- Supporting subtext -->
  ${subtextSvgLines}

  <!-- Bottom divider -->
  <rect x="180" y="800" width="720" height="2" fill="url(#accentBar)" opacity="0.7"/>

  <!-- Bottom: website -->
  <text x="540" y="860" font-family="Arial, sans-serif" font-size="28" fill="${WHITE}" text-anchor="middle" opacity="0.6">youtube.com/@MrSabPata</text>

  <!-- Pakistan flag green stripe (subtle) -->
  <rect x="0" y="${H-8}" width="${W}" height="8" fill="#01411C" opacity="0.9"/>
</svg>`;
}

function buildFallbackSvg(opts: PostImageOptions): string {
  const statLines = wrapText(opts.stat, 20);
  const subtextLines = opts.subtext ? wrapText(opts.subtext, 34) : [];

  const startSize = statLines.length <= 2 ? 96 : 76;
  const statFontSize = fitFontSize(statLines, 940, startSize, 40);
  const statLineHeight = statFontSize * 1.2;
  const statBlockHeight = statLines.length * statLineHeight;
  const subtextFontSize = 36;
  const subtextLineHeight = subtextFontSize * 1.4;
  const subtextBlockHeight = subtextLines.length * subtextLineHeight + (subtextLines.length ? 40 : 0);
  const totalContentHeight = statBlockHeight + subtextBlockHeight;
  const contentStartY = 220 + (560 - totalContentHeight) / 2;

  const statSvgLines = statLines.map((line, i) => {
    const y = contentStartY + i * statLineHeight + statFontSize;
    return `<text x="540" y="${y}" font-family="Arial Black, Arial, sans-serif" font-size="${statFontSize}" font-weight="900" fill="${ACCENT}" text-anchor="middle" letter-spacing="1">${escapeXml(line)}</text>`;
  }).join("\n    ");

  const subtextStartY = contentStartY + statBlockHeight + 40;
  const subtextSvgLines = subtextLines.map((line, i) => {
    const y = subtextStartY + i * subtextLineHeight + subtextFontSize;
    return `<text x="540" y="${y}" font-family="Arial, sans-serif" font-size="${subtextFontSize}" fill="${SUBTEXT}" text-anchor="middle">${escapeXml(line)}</text>`;
  }).join("\n    ");

  const pillarLabel = escapeXml(opts.pillar.toUpperCase());

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${BG_TOP}"/>
      <stop offset="100%" stop-color="${BG_BTM}"/>
    </linearGradient>
    <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
      <path d="M 60 0 L 0 0 0 60" fill="none" stroke="rgba(255,255,255,0.04)" stroke-width="1"/>
    </pattern>
    <linearGradient id="accentBar" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${ACCENT}" stop-opacity="0"/>
      <stop offset="30%" stop-color="${ACCENT}"/>
      <stop offset="70%" stop-color="${ACCENT}"/>
      <stop offset="100%" stop-color="${ACCENT}" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#grid)"/>
  <rect x="40" y="40" width="80" height="6" fill="${ACCENT}" opacity="0.7"/>
  <rect x="40" y="40" width="6" height="80" fill="${ACCENT}" opacity="0.7"/>
  <rect x="${W-120}" y="40" width="80" height="6" fill="${ACCENT}" opacity="0.7"/>
  <rect x="${W-46}" y="40" width="6" height="80" fill="${ACCENT}" opacity="0.7"/>
  <rect x="40" y="${H-46}" width="80" height="6" fill="${ACCENT}" opacity="0.7"/>
  <rect x="40" y="${H-120}" width="6" height="80" fill="${ACCENT}" opacity="0.7"/>
  <rect x="${W-120}" y="${H-46}" width="80" height="6" fill="${ACCENT}" opacity="0.7"/>
  <rect x="${W-46}" y="${H-120}" width="6" height="80" fill="${ACCENT}" opacity="0.7"/>
  <text x="540" y="120" font-family="Arial, sans-serif" font-size="42" font-weight="bold" fill="${WHITE}" text-anchor="middle" opacity="0.9">MrSabPata</text>
  <text x="540" y="168" font-family="Arial, sans-serif" font-size="22" fill="${ACCENT}" text-anchor="middle" opacity="0.75" letter-spacing="3">${pillarLabel}</text>
  <rect x="180" y="190" width="720" height="2" fill="url(#accentBar)" opacity="0.6"/>
  ${statSvgLines}
  ${subtextSvgLines}
  <rect x="180" y="800" width="720" height="2" fill="url(#accentBar)" opacity="0.6"/>
  <text x="540" y="860" font-family="Arial, sans-serif" font-size="28" fill="${WHITE}" text-anchor="middle" opacity="0.5">youtube.com/@MrSabPata</text>
  <rect x="0" y="${H-8}" width="${W}" height="8" fill="#01411C" opacity="0.8"/>
</svg>`;
}

export interface PostImageResult {
  imagePath: string;     // branded static PNG (text overlay on AI background) — for X
  bgImagePath?: string;  // raw AI background only (no text) — for animated video
}

export async function generatePostImage(opts: PostImageOptions): Promise<PostImageResult> {
  const outDir = opts.outDir ?? path.join("company", "post-images");
  await fs.mkdir(outDir, { recursive: true });

  const filenameStem = opts.filename ?? new Date().toISOString().slice(0, 16).replace("T", "-");
  const imagePath = path.join(outDir, filenameStem + ".png");
  const bgPath    = path.join(outDir, filenameStem + "-bg.png");

  const seed = seedFromFilename(filenameStem);
  const overlaySvg = buildTextOverlaySvg(opts);

  try {
    const aiBg = await downloadAIBackground(opts.pillar, seed);

    // Save raw background (no text) — used by animated video generator
    await sharp(aiBg)
      .resize(W, H, { fit: "cover", position: "centre" })
      .png({ quality: 92 })
      .toFile(bgPath);

    // Save branded image (text overlay) — used by X static post
    await sharp(aiBg)
      .resize(W, H, { fit: "cover", position: "centre" })
      .composite([{ input: Buffer.from(overlaySvg), top: 0, left: 0 }])
      .png({ quality: 95 })
      .toFile(imagePath);

    return { imagePath, bgImagePath: bgPath };
  } catch {
    // Fallback: gradient SVG (no separate background available)
    await sharp(Buffer.from(buildFallbackSvg(opts)))
      .png({ quality: 95 })
      .toFile(imagePath);
    return { imagePath };
  }
}

// Converts a PNG image to a 5-second looping MP4 video (for TikTok)
export async function imageToVideo(imagePath: string): Promise<string> {
  const videoPath = imagePath.replace(/\.png$/i, ".mp4");
  execSync(
    `ffmpeg -y -loop 1 -i "${imagePath}" -vf "scale=1080:1080,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=#0D1B2A" -t 5 -c:v libx264 -pix_fmt yuv420p -r 30 "${videoPath}"`,
    { stdio: "ignore" }
  );
  return videoPath;
}
