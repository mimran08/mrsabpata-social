import { execSync } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { log } from "./logger.js";

const ROLE = "VideoGen";

// MrSabPata brand background colour (matches image-gen.ts)
const BG_HEX = "0D1B2A";

interface VideoOptions {
  imagePath: string; // 1080×1080 branded PNG
  voiceText: string; // unused — kept for caller signature compat (was TTS source)
  filename:  string;
  outDir?:   string;
}

export async function generateVideo(opts: VideoOptions): Promise<string> {
  const outDir = opts.outDir ?? path.join("company", "post-videos");
  await fs.mkdir(outDir, { recursive: true });
  const videoPath = path.join(outDir, `${opts.filename}.mp4`);
  void opts.voiceText; // intentionally unused — preserved for caller signature

  const duration = 20; // seconds — fixed for silent renderer

  // Step 3: Build ffmpeg command
  // Layout: 1080×1920 — image centred in middle with navy padding top+bottom
  // Slow Ken Burns zoom (1.00 → 1.05 over the full duration) for motion feel
  const zoomSpeed  = (0.05 / (duration * 30)).toFixed(6); // spreads zoom over all frames
  const vfFilter = [
    // Scale image down to fit width, keep aspect ratio
    `scale=1080:1080:force_original_aspect_ratio=decrease`,
    // Pad to 1080×1920 with brand colour
    `pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=${BG_HEX}`,
    // Gentle Ken Burns zoom — makes still image feel alive
    `zoompan=z='min(zoom+${zoomSpeed},1.05)':d=${duration * 30}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920`,
    // Fade in over first 0.5s, fade out last 0.5s
    `fade=in:st=0:d=0.5,fade=out:st=${duration - 0.5}:d=0.5`,
  ].join(",");

  execSync(
    `ffmpeg -y -loop 1 -i "${path.resolve(opts.imagePath)}" ` +
    `-vf "${vfFilter}" ` +
    `-t ${duration} -c:v libx264 -preset fast -pix_fmt yuv420p -r 30 ` +
    `"${videoPath}"`,
    { stdio: "ignore" }
  );

  log(ROLE, "info", `Video ready: ${videoPath} (${duration}s, silent)`);
  return videoPath;
}
