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

// Per-pillar background prompts — varied but always dark-toned
const PILLAR_PROMPTS: Record<string, string> = {
  "Sweden Visa & Immigration":  "Stockholm government buildings, Swedish passport, EU visa documents, Scandinavian architecture, dramatic night lighting",
  "Work & Visa in Sweden":      "Stockholm government buildings, Swedish passport, EU visa documents, Scandinavian architecture, dramatic night lighting",
  "Jobs & Career in Sweden":    "Modern Stockholm office interior, laptop, Nordic business district skyline, professional workplace, dramatic low light",
  "Real Immigrant Stories":     "Pakistani family in Sweden, multicultural community Scandinavia, immigrant journey, warm street lighting, documentary style",
  "Personal / Faith / Life":    "Swedish northern forest at dusk, mosque silhouette Sweden, peaceful Nordic landscape, spiritual reflection",
  "Faith & Life in Sweden":     "Swedish northern forest at dusk, mosque silhouette Sweden, peaceful Nordic landscape, spiritual reflection",
};

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

function seedFromFilename(filename: string): number {
  let hash = 0;
  for (let i = 0; i < filename.length; i++) {
    hash = ((hash << 5) - hash + filename.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 99999;
}

// Download AI background from Pollinations.ai (FLUX model, free, no API key)
async function downloadAIBackground(pillar: string, seed: number): Promise<Buffer> {
  const basePrompt = PILLAR_PROMPTS[pillar]
    ?? "Stockholm Sweden, Scandinavian landscape, Nordic design, dramatic lighting";
  const fullPrompt = `${basePrompt}, deep navy blue and forest green tones, dark cinematic background, no text, no watermark, no people faces, ultra quality`;
  const encoded = encodeURIComponent(fullPrompt);
  const url = `https://image.pollinations.ai/prompt/${encoded}?width=1080&height=1080&seed=${seed}&nologo=true&model=flux`;

  return new Promise((resolve, reject) => {
    const get = (targetUrl: string, redirectsLeft = 5) => {
      const mod = targetUrl.startsWith("https") ? https : require("node:http");
      mod.get(targetUrl, (res: import("node:http").IncomingMessage) => {
        if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location && redirectsLeft > 0) {
          return get(res.headers.location, redirectsLeft - 1);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`Pollinations.ai HTTP ${res.statusCode}`));
        }
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks)));
        res.on("error", reject);
      }).on("error", reject);
    };
    get(url);
  });
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

  const statFontSize = statLines.length <= 2 ? 96 : 76;
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

  const statFontSize = statLines.length <= 2 ? 96 : 76;
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
