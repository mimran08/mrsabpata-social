import { chromium } from "playwright";
import { execSync } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { log } from "./logger.js";
import { pickMusicTrack, type MusicMood } from "./music-picker.js";

const ROLE = "VideoGenAnimated";
const EL_VOICE_ID = "pNInz6obpgDQGcFmaJgB";
const EL_MODEL    = "eleven_multilingual_v2";

export interface AnimatedVideoOptions {
  imagePath: string;      // branded static PNG — fallback background if bgImagePath not given
  bgImagePath?: string;   // raw AI background (no text overlay) — preferred for clean animation
  stat: string;
  subtext?: string;
  pillar: string;
  voiceText: string;
  filename: string;
  outDir?: string;
  musicMood?: MusicMood;  // "inspirational" for quotes, "ambient" for news, "cultural" for general
}

export async function generateAnimatedVideo(opts: AnimatedVideoOptions): Promise<string> {
  const outDir = opts.outDir ?? path.join("company", "post-videos");
  await fs.mkdir(outDir, { recursive: true });

  const mp4Path  = path.join(outDir, `${opts.filename}.mp4`);
  const htmlPath = path.join(outDir, `${opts.filename}-anim.html`);

  // Optional ElevenLabs voiceover
  let audioPath: string | undefined;
  const elKey = process.env.ELEVENLABS_API_KEY;
  if (elKey) {
    try {
      audioPath = await generateVoiceover(opts.voiceText, path.join(outDir, `${opts.filename}-voice.mp3`), elKey);
      log(ROLE, "info", `Voiceover: ${audioPath}`);
    } catch (err) {
      log(ROLE, "warn", `Voiceover failed: ${String(err).slice(0, 80)}`);
    }
  }

  // Background music
  const musicPath = await pickMusicTrack(opts.musicMood ?? "ambient");
  if (musicPath) log(ROLE, "info", `Music: ${path.basename(musicPath)}`);
  else log(ROLE, "info", "No music tracks found — video will be silent/voice-only");

  // Duration: audio length or 20s default
  let duration = 20;
  if (audioPath) {
    const raw = execSync(
      `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${audioPath}"`
    ).toString().trim();
    const n = parseFloat(raw);
    if (!isNaN(n)) duration = Math.ceil(n) + 2;
  }

  // Prefer raw background (no text overlay) so animated HTML text stays clean
  const bgFile    = opts.bgImagePath ?? opts.imagePath;
  const imgBuf    = await fs.readFile(bgFile);
  const imgBase64 = imgBuf.toString("base64");

  const html = buildAnimationHtml({ imgBase64, stat: opts.stat, subtext: opts.subtext, pillar: opts.pillar, duration });
  await fs.writeFile(htmlPath, html, "utf-8");

  // Playwright recording — Chromium renders CSS animations reliably
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1080, height: 1920 },
    recordVideo: { dir: outDir, size: { width: 1080, height: 1920 } },
  });
  const page = await context.newPage();
  await page.goto(`file://${path.resolve(htmlPath)}`);
  await page.waitForTimeout((duration + 1) * 1000);

  const webmFile = await page.video()?.path();
  await context.close();
  await browser.close();

  if (!webmFile) throw new Error("Playwright did not produce a video file");

  // Convert webm → mp4 with optional voiceover + background music
  const fadeOut = Math.max(0, duration - 2);
  if (audioPath && musicPath) {
    // Voiceover + background music (music at 18% so voice is clear)
    execSync(
      `ffmpeg -y -i "${webmFile}" -i "${audioPath}" -i "${musicPath}" ` +
      `-filter_complex "[2:a]volume=0.18,afade=t=out:st=${fadeOut}:d=2[bg];[1:a][bg]amix=inputs=2:duration=first[out]" ` +
      `-map 0:v -map "[out]" -c:v libx264 -preset fast -pix_fmt yuv420p -c:a aac -b:a 128k -shortest "${mp4Path}"`,
      { stdio: "ignore" }
    );
  } else if (audioPath) {
    // Voiceover only
    execSync(
      `ffmpeg -y -i "${webmFile}" -i "${audioPath}" ` +
      `-c:v libx264 -preset fast -pix_fmt yuv420p -c:a aac -b:a 128k -shortest "${mp4Path}"`,
      { stdio: "ignore" }
    );
  } else if (musicPath) {
    // Background music only (no voiceover) — music at 30%
    execSync(
      `ffmpeg -y -i "${webmFile}" -i "${musicPath}" ` +
      `-filter_complex "[1:a]volume=0.30,afade=t=out:st=${fadeOut}:d=2[bg]" ` +
      `-map 0:v -map "[bg]" -c:v libx264 -preset fast -pix_fmt yuv420p -c:a aac -b:a 128k -shortest "${mp4Path}"`,
      { stdio: "ignore" }
    );
  } else {
    // Silent
    execSync(
      `ffmpeg -y -i "${webmFile}" -c:v libx264 -preset fast -pix_fmt yuv420p "${mp4Path}"`,
      { stdio: "ignore" }
    );
  }

  await fs.unlink(webmFile).catch(() => {});
  await fs.unlink(htmlPath).catch(() => {});

  const audioDesc = [audioPath ? "voice" : "", musicPath ? "music" : ""].filter(Boolean).join("+") || "silent";
  log(ROLE, "info", `Animated video: ${mp4Path} (${duration}s, ${audioDesc})`);
  return mp4Path;
}

// ─── HTML animation template ──────────────────────────────────────────────────

interface HtmlOpts {
  imgBase64: string;
  stat: string;
  subtext?: string;
  pillar: string;
  duration: number;
}

function buildAnimationHtml(o: HtmlOpts): string {
  const pillarUpper = o.pillar.toUpperCase();
  const subtextLines = o.subtext
    ? o.subtext.split(/\n|(?<=\.)\s+/).filter(Boolean)
    : [];

  // Stagger each subtext line by 0.25s
  const subtextHtml = subtextLines
    .map((line, i) => {
      const delay = 4.2 + i * 0.25;
      return `<p class="sub-line" style="animation-delay:${delay}s">${escHtml(line)}</p>`;
    })
    .join("\n");

  // Stat font size: shrink if very long
  const statLen = o.stat.length;
  const statFs = statLen <= 18 ? 96 : statLen <= 30 ? 78 : 62;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<style>
  *, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }
  html, body { width:1080px; height:1920px; overflow:hidden; background:#0D1B2A; font-family:Arial,sans-serif; }

  /* ── Background ── */
  .bg {
    position:absolute; inset:0;
    background: url("data:image/png;base64,${o.imgBase64}") center/cover no-repeat;
    animation: bgZoom ${o.duration}s ease-out forwards;
    will-change: transform;
  }
  @keyframes bgZoom {
    from { transform:scale(1.0); }
    to   { transform:scale(1.08); }
  }

  /* Dark overlay + vignette */
  .overlay {
    position:absolute; inset:0;
    background:
      linear-gradient(to bottom, rgba(13,27,42,0.92) 0%, rgba(13,27,42,0.50) 30%, rgba(13,27,42,0.50) 70%, rgba(13,27,42,0.92) 100%),
      rgba(13,27,42,0.45);
    animation: fadeIn 0.6s ease forwards;
  }

  /* ── Content shell ── */
  .content {
    position:absolute; inset:0;
    display:flex; flex-direction:column; align-items:center; justify-content:center;
    padding:80px 60px;
    gap:0;
  }

  /* ── Brand ── */
  .brand {
    font-size:56px; font-weight:900; color:#fff; letter-spacing:3px;
    text-shadow: 0 2px 12px rgba(0,0,0,0.6);
    animation: slideDown 0.7s cubic-bezier(0.22,1,0.36,1) 0.8s both;
  }
  @keyframes slideDown {
    from { transform:translateY(-50px); opacity:0; }
    to   { transform:translateY(0);     opacity:1; }
  }

  /* ── Pillar tag ── */
  .pillar {
    font-size:21px; color:#F4D03F; letter-spacing:4px;
    margin-top:14px;
    animation: fadeIn 0.7s ease 1.4s both;
  }

  /* ── Divider lines that draw from centre ── */
  .divider {
    width:680px; height:2px;
    background:linear-gradient(to right, transparent 0%, #F4D03F 30%, #F4D03F 70%, transparent 100%);
    margin:22px 0;
    transform:scaleX(0); transform-origin:center;
  }
  .divider.top    { animation: drawLine 0.7s ease 1.9s forwards; }
  .divider.bottom { animation: drawLine 0.7s ease 5.0s forwards; }
  @keyframes drawLine {
    from { transform:scaleX(0); opacity:0; }
    to   { transform:scaleX(1); opacity:1; }
  }

  /* ── Main stat ── */
  .stat {
    font-size:${statFs}px; font-weight:900; color:#F4D03F;
    text-align:center; line-height:1.15; letter-spacing:1px;
    text-shadow: 0 4px 20px rgba(0,0,0,0.7);
    padding:0 20px;
    transform:scale(0.6) translateY(40px); opacity:0;
    animation: statReveal 0.9s cubic-bezier(0.22,1,0.36,1) 2.5s forwards;
  }
  @keyframes statReveal {
    from { transform:scale(0.6) translateY(40px); opacity:0; }
    to   { transform:scale(1)   translateY(0);    opacity:1; }
  }

  /* ── Subtext block ── */
  .subtext {
    margin-top:28px;
    display:flex; flex-direction:column; align-items:center; gap:10px;
  }
  .sub-line {
    font-size:34px; color:#B2DFDB; text-align:center; line-height:1.45;
    padding:0 40px;
    opacity:0;
    animation: slideUp 0.6s ease both;
  }
  @keyframes slideUp {
    from { transform:translateY(30px); opacity:0; }
    to   { transform:translateY(0);    opacity:1; }
  }

  /* ── URL ── */
  .url {
    font-size:28px; color:rgba(255,255,255,0.55);
    margin-top:20px;
    animation: fadeIn 0.7s ease 5.5s both;
  }

  /* ── Pakistan stripe ── */
  .pk-stripe {
    position:absolute; bottom:0; left:0; right:0; height:10px;
    background:#01411C;
    transform:translateY(10px);
    animation: slideUp 0.5s ease 6s forwards;
  }

  /* ── Corner accents ── */
  .corner {
    position:absolute; width:80px; height:80px;
    opacity:0;
    animation: fadeIn 0.5s ease 1.2s forwards, cornerPulse 3s ease-in-out 7s infinite;
  }
  @keyframes cornerPulse {
    0%,100% { opacity:0.7; }
    50%     { opacity:1.0; }
  }
  .corner::before, .corner::after { content:''; position:absolute; background:#F4D03F; }
  .corner::before { width:100%; height:5px; top:0; left:0; }
  .corner::after  { width:5px; height:100%; top:0; left:0; }
  .corner.tr { top:50px; right:50px; transform:rotate(90deg); }
  .corner.bl { bottom:50px; left:50px; transform:rotate(270deg); }
  .corner.br { bottom:50px; right:50px; transform:rotate(180deg); }
  .corner.tl { top:50px; left:50px; }

  @keyframes fadeIn {
    from { opacity:0; }
    to   { opacity:1; }
  }

  /* ── Floating particles (subtle depth) ── */
  .particle {
    position:absolute;
    border-radius:50%;
    background:rgba(244,208,63,0.12);
    animation: floatUp linear infinite;
    will-change:transform,opacity;
  }
  @keyframes floatUp {
    0%   { transform:translateY(0)   scale(1);   opacity:0.12; }
    50%  { transform:translateY(-60px) scale(1.1); opacity:0.25; }
    100% { transform:translateY(-120px) scale(0.9); opacity:0; }
  }
</style>
</head>
<body>
  <div class="bg"></div>
  <div class="overlay"></div>

  <!-- Corner accents -->
  <div class="corner tl"></div>
  <div class="corner tr"></div>
  <div class="corner bl"></div>
  <div class="corner br"></div>

  <!-- Floating particles -->
  ${buildParticles()}

  <div class="content">
    <div class="brand">MrSabPata</div>
    <div class="pillar">${escHtml(pillarUpper)}</div>
    <div class="divider top"></div>
    <div class="stat">${escHtml(o.stat)}</div>
    <div class="subtext">${subtextHtml}</div>
    <div class="divider bottom"></div>
    <div class="url">youtube.com/@MrSabPata</div>
  </div>

  <div class="pk-stripe"></div>
</body>
</html>`;
}

function buildParticles(): string {
  const particles = [];
  const positions = [
    [120, 400, 8, 8],  [900, 700, 6, 12], [200, 1100, 10, 15],
    [850, 1400, 7, 10], [500, 300, 5, 20], [700, 900, 9, 7],
    [100, 1600, 6, 18], [950, 200, 8, 14], [400, 1700, 5, 9],
  ];
  for (const [x, y, size, dur] of positions) {
    particles.push(
      `<div class="particle" style="left:${x}px;top:${y}px;width:${size}px;height:${size}px;animation-duration:${dur}s;animation-delay:${(x % 5)}s"></div>`
    );
  }
  return particles.join("\n  ");
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ─── ElevenLabs voiceover ─────────────────────────────────────────────────────

async function generateVoiceover(text: string, outPath: string, apiKey: string): Promise<string> {
  const clean = text
    .replace(/#\S+/g, "")
    .replace(/\*\*/g, "")
    .replace(/[^\w\s؀-ۿ.,!?'\-\n]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 800);

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${EL_VOICE_ID}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      "Accept": "audio/mpeg",
    },
    body: JSON.stringify({
      text: clean,
      model_id: EL_MODEL,
      voice_settings: { stability: 0.45, similarity_boost: 0.80, style: 0.25, use_speaker_boost: true },
    }),
  });

  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 80)}`);

  await fs.writeFile(outPath, Buffer.from(await res.arrayBuffer()));
  return outPath;
}
