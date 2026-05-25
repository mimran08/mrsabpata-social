// Generates a ~58-second structured video with two pacing modes:
//
//   pacingMode = "many-short":   7 distinct scenes — hook + 3 points + stat + action + cta
//   pacingMode = "headline-detail": 7 scenes — hook + (point headline + point detail) × 3 + cta
//
// Each scene has its own background (cycled from a pool of 3 AI-generated images)
// so the visual changes throughout the video.

import { chromium } from "playwright";
import { execSync } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { log } from "./logger.js";
import { pickMusicTrack } from "./music-picker.js";
import { downloadAIBackground } from "./image-gen.js";
import type { ScriptDict } from "./script-dict.js";

const ROLE = "VideoGenLong";
const EL_VOICE_ID = "pNInz6obpgDQGcFmaJgB";
const EL_MODEL    = "eleven_multilingual_v2";

const MAX_DURATION = 58;   // hard ceiling under YouTube Shorts 60s

export type PacingMode = "many-short" | "headline-detail";

export interface LongVideoOptions {
  script: ScriptDict;
  imagePath: string;          // branded static PNG — fallback bg if no bgImagePaths given
  bgImagePath?: string;       // raw AI background — fallback if bgImagePaths empty
  bgImagePaths?: string[];    // pool of background images (cycled per scene) — preferred
  pillar: string;
  filename: string;
  outDir?: string;
  pacingMode?: PacingMode;    // default "many-short"
}

// Generate N raw backgrounds for a pillar, returning their on-disk paths.
// Used by the preview script + the long video pipeline to get scene variety.
export async function generateBackgroundPool(pillar: string, count: number, filenameStem: string, outDir = "/tmp"): Promise<string[]> {
  await fs.mkdir(outDir, { recursive: true });
  const paths: string[] = [];
  for (let i = 0; i < count; i++) {
    const seed = (Math.abs(hashString(filenameStem + ":" + i)) % 99999) + 1;
    try {
      const buf = await downloadAIBackground(pillar, seed);
      const p = path.join(outDir, `${filenameStem}-bg${i + 1}.png`);
      await fs.writeFile(p, buf);
      paths.push(p);
      log(ROLE, "info", `Background ${i + 1}/${count}: ${path.basename(p)} (seed ${seed})`);
    } catch (err) {
      log(ROLE, "warn", `Background ${i + 1}/${count} failed: ${String(err).slice(0, 80)}`);
    }
  }
  return paths;
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return h;
}

export async function generateLongVideo(opts: LongVideoOptions): Promise<string> {
  const outDir = opts.outDir ?? path.join("company", "post-videos");
  await fs.mkdir(outDir, { recursive: true });

  const pacingMode: PacingMode = opts.pacingMode ?? "many-short";
  const mp4Path  = path.join(outDir, `${opts.filename}.mp4`);
  const htmlPath = path.join(outDir, `${opts.filename}-long.html`);

  if (opts.script.points.length < 2) {
    throw new Error(`Long video needs at least 2 points; got ${opts.script.points.length}`);
  }

  // Build scenes from script + pacing mode. Total duration = sum of scenes,
  // capped at MAX_DURATION (the CTA stretches if total < MIN_DURATION).
  const scenes = buildScenes(opts.script, pacingMode);
  const totalDuration = scenes.reduce((acc, s) => acc + s.dur, 0);
  log(ROLE, "info", `Pacing: ${pacingMode} → ${scenes.length} scenes / ${totalDuration.toFixed(1)}s total (${scenes.map(s => `${s.kind}:${s.dur.toFixed(1)}s`).join(", ")})`);

  // Voiceover script — join all spoken text with sentence breaks for natural pacing
  const spokenLines = scenes.map(s => s.voicePart).filter(Boolean);
  const voiceText = spokenLines.join(" ... ");

  // Optional ElevenLabs voiceover
  let audioPath: string | undefined;
  const elKey = process.env.ELEVENLABS_API_KEY;
  if (elKey) {
    try {
      audioPath = await generateVoiceover(voiceText, path.join(outDir, `${opts.filename}-voice.mp3`), elKey);
      log(ROLE, "info", `Voiceover: ${audioPath}`);
    } catch (err) {
      log(ROLE, "warn", `Voiceover failed: ${String(err).slice(0, 80)}`);
    }
  }

  const musicPath = await pickMusicTrack(opts.script.music_mood);
  if (musicPath) log(ROLE, "info", `Music: ${path.basename(musicPath)}`);

  // Backgrounds: prefer pool, fall back to single bg
  const bgPaths = (opts.bgImagePaths?.length ? opts.bgImagePaths : [opts.bgImagePath ?? opts.imagePath]);
  const bgBase64s = await Promise.all(bgPaths.map(async p => (await fs.readFile(p)).toString("base64")));
  log(ROLE, "info", `Backgrounds: cycling ${bgBase64s.length} image(s) across ${scenes.length} scenes`);

  // Logo
  let logoBase64: string | undefined;
  for (const candidate of [path.join("company", "brand-logo.png"), path.join("company", "tiktok-app-icon.png")]) {
    try { logoBase64 = (await fs.readFile(candidate)).toString("base64"); break; } catch { /* try next */ }
  }
  if (!logoBase64) log(ROLE, "warn", "No brand logo found — falling back to text brand");

  const html = buildHtml({ bgBase64s, logoBase64, script: opts.script, pillar: opts.pillar, scenes, totalDuration });
  await fs.writeFile(htmlPath, html, "utf-8");

  // Record with Playwright
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1080, height: 1920 },
    recordVideo: { dir: outDir, size: { width: 1080, height: 1920 } },
  });
  const page = await context.newPage();
  await page.goto(`file://${path.resolve(htmlPath)}`);
  await page.waitForTimeout((totalDuration + 1) * 1000);

  const webmFile = await page.video()?.path();
  await context.close();
  await browser.close();

  if (!webmFile) throw new Error("Playwright did not produce a video file");

  // Mux audio
  const fadeOut = Math.max(0, totalDuration - 2);
  if (audioPath && musicPath) {
    execSync(
      `ffmpeg -y -i "${webmFile}" -i "${audioPath}" -i "${musicPath}" ` +
      `-filter_complex "[2:a]volume=0.18,afade=t=out:st=${fadeOut}:d=2[bg];[1:a][bg]amix=inputs=2:duration=first[out]" ` +
      `-map 0:v -map "[out]" -c:v libx264 -preset fast -pix_fmt yuv420p -c:a aac -b:a 128k -t ${totalDuration} "${mp4Path}"`,
      { stdio: "ignore" }
    );
  } else if (audioPath) {
    execSync(
      `ffmpeg -y -i "${webmFile}" -i "${audioPath}" ` +
      `-c:v libx264 -preset fast -pix_fmt yuv420p -c:a aac -b:a 128k -t ${totalDuration} "${mp4Path}"`,
      { stdio: "ignore" }
    );
  } else if (musicPath) {
    execSync(
      `ffmpeg -y -i "${webmFile}" -i "${musicPath}" ` +
      `-filter_complex "[1:a]volume=0.30,afade=t=out:st=${fadeOut}:d=2[bg]" ` +
      `-map 0:v -map "[bg]" -c:v libx264 -preset fast -pix_fmt yuv420p -c:a aac -b:a 128k -t ${totalDuration} "${mp4Path}"`,
      { stdio: "ignore" }
    );
  } else {
    execSync(
      `ffmpeg -y -i "${webmFile}" -c:v libx264 -preset fast -pix_fmt yuv420p -t ${totalDuration} "${mp4Path}"`,
      { stdio: "ignore" }
    );
  }

  await fs.unlink(webmFile).catch(() => {});
  await fs.unlink(htmlPath).catch(() => {});

  const audioDesc = [audioPath ? "voice" : "", musicPath ? "music" : ""].filter(Boolean).join("+") || "silent";
  log(ROLE, "info", `Long video: ${mp4Path} (${totalDuration.toFixed(1)}s, ${pacingMode}, ${audioDesc})`);
  return mp4Path;
}

// ─── Scene model ────────────────────────────────────────────────────────────

type SceneKind =
  | "hook"
  | "point"
  | "point-headline"
  | "point-detail"
  | "stat"
  | "action"
  | "cta";

interface Scene {
  kind: SceneKind;
  start: number;       // seconds from video start
  dur: number;         // seconds
  text: string;        // main text shown on screen
  subText?: string;    // optional one-line supporting text shown beneath main (smaller)
  badge?: string;      // small label above main text ("1", "STAT", "DO THIS")
  voicePart: string;   // what TTS reads for this scene (may equal text)
  bgIndex: number;     // which background from the pool to use
}

// Split a point into a punchy headline + supporting detail so the scene shows two
// lines of info instead of one. Splits on natural breaks (colon, em-dash, first
// comma). Returns { text, subText } where subText is undefined if no clean split.
function splitPointForDisplay(p: string): { text: string; subText?: string } {
  const trimmed = p.trim();
  // Try natural breaks in order of strength
  for (const sep of [": ", " — ", ", "]) {
    const idx = trimmed.indexOf(sep);
    // Only split if both halves are substantial (≥10 chars on each side)
    if (idx >= 10 && trimmed.length - idx - sep.length >= 10) {
      return {
        text: trimmed.slice(0, idx).trim(),
        subText: trimmed.slice(idx + sep.length).trim(),
      };
    }
  }
  return { text: trimmed };
}

function buildScenes(script: ScriptDict, mode: PacingMode): Scene[] {
  const points = script.points.slice(0, 3);  // cap at 3 for timing
  const stat = script.stat;
  const actionLine = script.actionLine;

  if (mode === "headline-detail") {
    // hook + (headline + detail) × 3 + cta. Each headline+detail pair shares a
    // bgIndex so the bg stays put while text expands.
    const HOOK = 6, HEAD = 4, DETAIL = 8, CTA = 6;
    const sceneList: Scene[] = [];
    let t = 0;
    sceneList.push({ kind: "hook", start: t, dur: HOOK, text: script.hook, voicePart: script.hook, bgIndex: 0 });
    t += HOOK;
    points.forEach((p, i) => {
      const headline = headlineFromPoint(p);
      sceneList.push({ kind: "point-headline", start: t, dur: HEAD, text: headline, badge: String(i + 1), voicePart: "", bgIndex: (i + 1) % 3 });
      t += HEAD;
      sceneList.push({ kind: "point-detail", start: t, dur: DETAIL, text: p, badge: String(i + 1), voicePart: p, bgIndex: (i + 1) % 3 });
      t += DETAIL;
    });
    sceneList.push({ kind: "cta", start: t, dur: CTA, text: script.cta, voicePart: script.cta, bgIndex: 0 });
    return capToMax(sceneList);
  }

  // pacingMode === "many-short" — up to 8 scenes (stat/action skipped if duplicate).
  // Target ~55-58s total with 5 points; capToMax shrinks if it goes over.
  const HOOK = 5, POINT = 7, STAT = 6, ACTION = 6, CTA = 5;
  const sceneList: Scene[] = [];
  let t = 0;

  const used: Set<string> = new Set();
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const remember = (s: string) => used.add(norm(s));
  const isDuplicate = (s: string) => {
    const n = norm(s);
    if (!n) return true;
    // Match if any existing scene normalizes to the same string or if either is a prefix of the other
    for (const existing of used) {
      if (existing === n) return true;
      if (existing.length > 20 && n.length > 20 && (existing.startsWith(n) || n.startsWith(existing))) return true;
    }
    return false;
  };

  sceneList.push({ kind: "hook", start: t, dur: HOOK, text: script.hook, voicePart: script.hook, bgIndex: 0 });
  remember(script.hook);
  t += HOOK;

  points.forEach((p, i) => {
    if (isDuplicate(p)) return;  // skip a point that's already been said
    const split = splitPointForDisplay(p);
    sceneList.push({
      kind: "point", start: t, dur: POINT,
      text: split.text,
      subText: split.subText,
      badge: String(i + 1),
      voicePart: p,
      bgIndex: (i + 1) % 3,
    });
    remember(p);
    t += POINT;
  });

  if (stat && !isDuplicate(stat)) {
    sceneList.push({ kind: "stat", start: t, dur: STAT, text: stat, badge: "KEY FACT", voicePart: stat, bgIndex: 0 });
    remember(stat);
    t += STAT;
  }
  if (actionLine && !isDuplicate(actionLine)) {
    sceneList.push({ kind: "action", start: t, dur: ACTION, text: actionLine, badge: "DO THIS", voicePart: actionLine, bgIndex: 2 });
    remember(actionLine);
    t += ACTION;
  }
  sceneList.push({ kind: "cta", start: t, dur: CTA, text: script.cta, voicePart: script.cta, bgIndex: 0 });
  // Stretch point scenes to fill toward ~56s total when content is thin. Per-point
  // cap is content-aware: posts with only 2-3 points get a bigger stretch (each
  // point can sit longer); posts with 4+ points stay punchy. Final video usually
  // lands at 50-58s; capToMax shrinks anything that exceeds 58s.
  return capToMax(stretchPoints(sceneList, 56));
}

function stretchPoints(scenes: Scene[], target: number): Scene[] {
  const total = scenes.reduce((acc, s) => acc + s.dur, 0);
  if (total >= target) return scenes;
  const pointIdxs = scenes.map((s, i) => (s.kind === "point" ? i : -1)).filter(i => i >= 0);
  if (pointIdxs.length === 0) return scenes;
  const needed = target - total;
  // Content-aware cap: thin posts (2-3 points) accept more stretch; dense posts (4+) stay tight.
  const maxAddPerPoint = pointIdxs.length <= 3 ? 5.0 : 2.5;
  const perPoint = Math.min(maxAddPerPoint, needed / pointIdxs.length);
  let t = 0;
  return scenes.map((s, i) => {
    const dur = pointIdxs.includes(i) ? +(s.dur + perPoint).toFixed(2) : s.dur;
    const out = { ...s, start: +t.toFixed(2), dur };
    t += dur;
    return out;
  });
}

// If total length exceeds MAX_DURATION, scale proportionally to stay under the
// Shorts 60s cap. If total is already under MAX, leave scenes at their natural
// durations (no awkward stretch).
function capToMax(scenes: Scene[]): Scene[] {
  const sum = scenes.reduce((acc, s) => acc + s.dur, 0);
  if (sum <= MAX_DURATION) return scenes;
  const factor = MAX_DURATION / sum;
  let t = 0;
  return scenes.map(s => {
    const dur = +(s.dur * factor).toFixed(2);
    const out = { ...s, start: +t.toFixed(2), dur };
    t += dur;
    return out;
  });
}

function headlineFromPoint(p: string): string {
  // First few words up to a natural break (comma / colon / dash / period)
  const trimmed = p.trim();
  const cutAt = Math.min(
    ...[",", ":", "—", "."].map(ch => {
      const i = trimmed.indexOf(ch);
      return i === -1 ? Infinity : i;
    })
  );
  if (cutAt === Infinity || cutAt < 8) {
    // Take first 5 words
    const words = trimmed.split(/\s+/).slice(0, 5);
    return words.join(" ");
  }
  return trimmed.slice(0, cutAt).trim();
}

// ─── HTML template ───────────────────────────────────────────────────────────

interface HtmlOpts {
  bgBase64s: string[];
  logoBase64?: string;
  script: ScriptDict;
  pillar: string;
  scenes: Scene[];
  totalDuration: number;
}

function buildHtml(o: HtmlOpts): string {
  const pillarUpper = o.pillar.toUpperCase();
  const total = o.totalDuration;

  // Per-scene CSS — content layer fades in/out per scene
  const sceneAnimBlocks: string[] = [];
  const sceneHtmls: string[] = [];

  for (let i = 0; i < o.scenes.length; i++) {
    const s = o.scenes[i];
    const animName = `scene-${i}`;
    const startPct = (s.start / total) * 100;
    const fadeInPct = ((s.start + 0.35) / total) * 100;
    const fadeOutPct = ((s.start + s.dur - 0.35) / total) * 100;
    const endPct = ((s.start + s.dur) / total) * 100;

    sceneAnimBlocks.push(`@keyframes ${animName} {
      0%               { opacity: 0; transform: translateY(20px); }
      ${startPct.toFixed(3)}%   { opacity: 0; transform: translateY(20px); }
      ${fadeInPct.toFixed(3)}%  { opacity: 1; transform: translateY(0); }
      ${fadeOutPct.toFixed(3)}% { opacity: 1; transform: translateY(0); }
      ${endPct.toFixed(3)}%     { opacity: 0; transform: translateY(-20px); }
      100%             { opacity: 0; transform: translateY(-20px); }
    }
    .${animName} { animation: ${animName} ${total}s linear forwards; }`);

    sceneHtmls.push(buildSceneHtml(s, animName, o.script));
  }

  // Per-background CSS — each bg fades in for scenes that use it.
  const bgAnimBlocks: string[] = [];
  const bgHtmls: string[] = [];
  for (let bi = 0; bi < o.bgBase64s.length; bi++) {
    const bgName = `bg-${bi}`;
    const scenesForBg = o.scenes.filter(s => s.bgIndex === bi);
    if (scenesForBg.length === 0) continue;

    const keyframes: string[] = ["0% { opacity: 0; transform: scale(1.0); }"];
    for (const s of scenesForBg) {
      const startPct = (s.start / total) * 100;
      const fadeInPct = ((s.start + 0.4) / total) * 100;
      const fadeOutPct = ((s.start + s.dur - 0.4) / total) * 100;
      const endPct = ((s.start + s.dur) / total) * 100;
      keyframes.push(
        `${startPct.toFixed(3)}% { opacity: 0; transform: scale(1.0); }`,
        `${fadeInPct.toFixed(3)}% { opacity: 1; transform: scale(1.02); }`,
        `${fadeOutPct.toFixed(3)}% { opacity: 1; transform: scale(1.08); }`,
        `${endPct.toFixed(3)}% { opacity: 0; transform: scale(1.10); }`,
      );
    }
    keyframes.push("100% { opacity: 0; transform: scale(1.10); }");
    bgAnimBlocks.push(`@keyframes ${bgName} { ${keyframes.join(" ")} }
    .${bgName} { animation: ${bgName} ${total}s linear forwards; }`);

    bgHtmls.push(`<div class="bg-layer ${bgName}" style="background-image:url('data:image/png;base64,${o.bgBase64s[bi]}')"></div>`);
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<style>
  *, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }
  html, body { width:1080px; height:1920px; overflow:hidden; background:#0D1B2A; font-family:Arial,sans-serif; }

  /* Per-bg layer — each fades in/out for its assigned scenes */
  .bg-layer {
    position:absolute; inset:0;
    background-size: cover; background-position: center;
    will-change: opacity, transform;
    opacity: 0;
  }

  /* Dark overlay for text readability */
  .overlay {
    position:absolute; inset:0;
    background:
      linear-gradient(to bottom, rgba(13,27,42,0.92) 0%, rgba(13,27,42,0.55) 28%, rgba(13,27,42,0.55) 72%, rgba(13,27,42,0.94) 100%);
  }

  /* Top brand bar */
  .brand-bar {
    position:absolute; top:0; left:0; right:0;
    padding: 40px 60px 30px;
    display:flex; align-items:center; justify-content:space-between;
    z-index:10;
  }
  .brand-logo {
    width: 130px; height: 130px;
    opacity: 0.5;  /* 50% transparent — less dominant in the brand bar */
    filter: drop-shadow(0 4px 16px rgba(0,0,0,0.5));
    display:flex; align-items:center; justify-content:center;
  }
  .brand-logo img { width: 100%; height: 100%; display:block; }
  .brand-text {
    font-size:48px; font-weight:900; color:#fff; letter-spacing:2px;
    text-shadow: 0 2px 8px rgba(0,0,0,0.6);
  }
  .pillar-tag {
    font-size:20px; color:#F4D03F; letter-spacing:3px; font-weight:600;
    padding: 8px 16px; border: 2px solid #F4D03F; border-radius: 24px;
  }

  /* Scene shell — each scene fades in over its window */
  .scene {
    position:absolute; inset:0;
    display:flex; flex-direction:column; align-items:center; justify-content:center;
    padding: 200px 60px 200px;
    text-align:center;
    opacity: 0;
    will-change: opacity, transform;
  }

  /* ── Badges (small label above main text) ── */
  .badge {
    font-size:24px; color:#F4D03F; letter-spacing:6px; font-weight:700;
    margin-bottom: 36px;
    padding: 10px 22px; border: 2px solid #F4D03F; border-radius: 30px;
  }
  .badge.large-num {
    font-size:130px; font-weight:900; color:#F4D03F;
    border:none; padding:0; letter-spacing:0;
    line-height:1; margin-bottom: 32px;
    text-shadow: 0 4px 24px rgba(0,0,0,0.7);
  }

  /* ── Scene text styles ── */
  .scene-text {
    color:#fff; font-weight:800; line-height:1.18;
    text-shadow: 0 4px 24px rgba(0,0,0,0.85);
    padding: 0 16px;
  }
  .scene-text.hook { font-size:78px; letter-spacing:0.5px; }
  .scene-text.hook.long { font-size:60px; }
  .scene-text.point { font-size:58px; font-weight:700; line-height:1.32; }
  .scene-text.point.long { font-size:46px; }
  .scene-text.point-headline { font-size:88px; font-weight:900; letter-spacing:1px; }
  .scene-text.point-detail { font-size:50px; font-weight:600; line-height:1.36; color:#E8F0FA; }
  .scene-text.stat { font-size:96px; font-weight:900; color:#F4D03F; letter-spacing:1px; }
  .scene-text.stat.long { font-size:64px; }
  .scene-text.action { font-size:64px; font-weight:800; color:#fff; }
  .scene-text.action.long { font-size:50px; }
  .scene-text.cta { font-size:50px; font-weight:700; }

  /* Supporting sub-line (smaller, sits below main text). Visibility is controlled
  by the parent .scene's fade animation — no separate keyframe needed. */
  .scene-subtext {
    margin-top: 24px;
    font-size: 36px; line-height: 1.32;
    color: #E8F0FA; font-weight: 500;
    text-shadow: 0 2px 12px rgba(0,0,0,0.7);
    padding: 0 24px; max-width: 920px;
    opacity: 0.92;
  }

  /* CTA-specific bits */
  .cta-arrow { font-size:90px; color:#F4D03F; animation: pulse 0.9s ease-in-out infinite; }
  @keyframes pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.15); } }
  .cta-handle { font-size:76px; color:#F4D03F; font-weight:900; margin-top: 30px;
    text-shadow: 0 4px 20px rgba(0,0,0,0.8); }

  /* Bottom progress bar (full duration) */
  .progress {
    position:absolute; bottom:60px; left:80px; right:80px; height:6px;
    background: rgba(255,255,255,0.18); border-radius: 3px; overflow:hidden; z-index:10;
  }
  .progress-fill {
    height:100%; background: #F4D03F;
    transform-origin: left; transform: scaleX(0);
    animation: progressGrow ${total}s linear forwards;
  }
  @keyframes progressGrow { from { transform: scaleX(0); } to { transform: scaleX(1); } }

  /* Bottom Pakistan green stripe */
  .pk-stripe {
    position:absolute; bottom:0; left:0; right:0; height:10px;
    background:#01411C; z-index:10;
  }

  /* Per-bg + per-scene animations injected below */
  ${bgAnimBlocks.join("\n")}
  ${sceneAnimBlocks.join("\n")}
</style>
</head>
<body>
  ${bgHtmls.join("\n")}
  <div class="overlay"></div>

  <div class="brand-bar">
    ${o.logoBase64
      ? `<div class="brand-logo"><img src="data:image/png;base64,${o.logoBase64}" alt="MrSabPata"/></div>`
      : `<div class="brand-text">MrSabPata</div>`}
    <div class="pillar-tag">${escHtml(pillarUpper)}</div>
  </div>

  ${sceneHtmls.join("\n")}

  <div class="progress"><div class="progress-fill"></div></div>
  <div class="pk-stripe"></div>
</body>
</html>`;
}

function buildSceneHtml(s: Scene, animClass: string, _script: ScriptDict): string {
  const longCls = s.text.length > 60 ? "long" : "";
  const text = escHtml(s.text);

  switch (s.kind) {
    case "hook":
      return `<div class="scene ${animClass}">
        <div class="scene-text hook ${longCls}">${text}</div>
      </div>`;
    case "point": {
      const sub = s.subText ? `<div class="scene-subtext">${escHtml(s.subText)}</div>` : "";
      return `<div class="scene ${animClass}">
        <div class="badge large-num">${s.badge ?? ""}</div>
        <div class="scene-text point ${s.text.length > 80 ? "long" : ""}">${text}</div>
        ${sub}
      </div>`;
    }
    case "point-headline":
      return `<div class="scene ${animClass}">
        <div class="badge large-num">${s.badge ?? ""}</div>
        <div class="scene-text point-headline">${text}</div>
      </div>`;
    case "point-detail":
      return `<div class="scene ${animClass}">
        <div class="badge large-num">${s.badge ?? ""}</div>
        <div class="scene-text point-detail">${text}</div>
      </div>`;
    case "stat":
      return `<div class="scene ${animClass}">
        <div class="badge">${escHtml(s.badge ?? "KEY FACT")}</div>
        <div class="scene-text stat ${s.text.length > 30 ? "long" : ""}">${text}</div>
      </div>`;
    case "action":
      return `<div class="scene ${animClass}">
        <div class="badge">${escHtml(s.badge ?? "DO THIS")}</div>
        <div class="scene-text action ${s.text.length > 70 ? "long" : ""}">${text}</div>
      </div>`;
    case "cta":
      return `<div class="scene ${animClass}">
        <div class="cta-arrow">▶</div>
        <div class="scene-text cta">${text}</div>
        <div class="cta-handle">@MrSabPata</div>
      </div>`;
  }
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ─── ElevenLabs voiceover ────────────────────────────────────────────────────

async function generateVoiceover(text: string, outPath: string, apiKey: string): Promise<string> {
  const clean = text
    .replace(/#\S+/g, "")
    .replace(/\*\*/g, "")
    .replace(/[^\w\s؀-ۿ.,!?'\-\n]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2200);

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
