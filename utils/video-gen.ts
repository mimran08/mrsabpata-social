import { execSync } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { log } from "./logger.js";

const ROLE = "VideoGen";

// MrSabPata brand background colour (matches image-gen.ts)
const BG_HEX = "0D1B2A";

// ElevenLabs voice — multilingual model handles Urdu+English code-switching
const EL_VOICE_ID = "pNInz6obpgDQGcFmaJgB"; // Adam — natural male, multilingual
const EL_MODEL    = "eleven_multilingual_v2";

interface VideoOptions {
  imagePath: string; // 1080×1080 branded PNG
  voiceText: string; // text to speak (Instagram caption works best — full sentences)
  filename:  string;
  outDir?:   string;
}

export async function generateVideo(opts: VideoOptions): Promise<string> {
  const outDir = opts.outDir ?? path.join("company", "post-videos");
  await fs.mkdir(outDir, { recursive: true });
  const videoPath = path.join(outDir, `${opts.filename}.mp4`);

  // Step 1: Generate voiceover if ElevenLabs key is available
  let audioPath: string | undefined;
  const elKey = process.env.ELEVENLABS_API_KEY;
  if (elKey) {
    try {
      audioPath = await generateVoiceover(opts.voiceText, path.join(outDir, `${opts.filename}-voice.mp3`), elKey);
      log(ROLE, "info", `Voiceover generated: ${audioPath}`);
    } catch (err) {
      log(ROLE, "warn", `Voiceover failed: ${String(err).slice(0, 100)} — creating silent video`);
    }
  }

  // Step 2: Determine video duration from audio, or use default
  let duration = 20; // seconds — good default for silent version
  if (audioPath) {
    const raw = execSync(
      `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${audioPath}" 2>/dev/null`
    ).toString().trim();
    const parsed = parseFloat(raw);
    if (!isNaN(parsed)) duration = Math.ceil(parsed) + 1; // +1s padding at end
  }

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

  if (audioPath) {
    execSync(
      `ffmpeg -y -loop 1 -i "${path.resolve(opts.imagePath)}" -i "${audioPath}" ` +
      `-vf "${vfFilter}" ` +
      `-c:v libx264 -preset fast -pix_fmt yuv420p -r 30 ` +
      `-c:a aac -b:a 128k -shortest ` +
      `"${videoPath}"`,
      { stdio: "ignore" }
    );
  } else {
    execSync(
      `ffmpeg -y -loop 1 -i "${path.resolve(opts.imagePath)}" ` +
      `-vf "${vfFilter}" ` +
      `-t ${duration} -c:v libx264 -preset fast -pix_fmt yuv420p -r 30 ` +
      `"${videoPath}"`,
      { stdio: "ignore" }
    );
  }

  log(ROLE, "info", `Video ready: ${videoPath} (${duration}s${audioPath ? " + voice" : ", silent"})`);
  return videoPath;
}

async function generateVoiceover(text: string, outPath: string, apiKey: string): Promise<string> {
  // Clean text for TTS — strip hashtags, markdown, reduce length
  const clean = text
    .replace(/#\S+/g, "")            // remove hashtags
    .replace(/\*\*/g, "")            // remove bold markdown
    .replace(/[^\w\s؀-ۿ.,!?'\-\n]/g, " ") // keep Urdu + Latin
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 800); // ElevenLabs free tier: 10k chars/month — stay well under

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
      voice_settings: {
        stability: 0.45,        // slightly varied for natural feel
        similarity_boost: 0.80,
        style: 0.25,            // subtle expressiveness
        use_speaker_boost: true,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs ${res.status}: ${err.slice(0, 120)}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(outPath, buf);
  return outPath;
}
