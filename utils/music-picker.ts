import * as fs from "node:fs/promises";
import * as path from "node:path";
import { log } from "./logger.js";

export type MusicMood = "inspirational" | "ambient" | "cultural";

const MUSIC_DIR = path.join(process.cwd(), "music");
const USE_LOG = path.join(MUSIC_DIR, "_usage-log.jsonl");

// Fixed epoch — change this if you add/remove tracks to reset the cycle
const EPOCH = new Date("2026-01-01").getTime();

// Collect every .mp3 from the active mood subdirs, sorted alphabetically for
// a deterministic, stable ordering that doesn't change between runs. Skips
// _quarantine/ (which holds tracks flagged by YouTube Content ID).
async function getAllTracks(): Promise<string[]> {
  const tracks: string[] = [];
  for (const subdir of ["ambient", "cultural", "inspirational"]) {
    const dir = path.join(MUSIC_DIR, subdir);
    try {
      const files = (await fs.readdir(dir))
        .filter(f => f.endsWith(".mp3"))
        .sort()
        .map(f => path.join(dir, f));
      tracks.push(...files);
    } catch { /* subdirectory absent */ }
  }
  return tracks;
}

// Stateless, deterministic track selection — no state file needed on CI.
//
// Slot formula:  (dayIndex × 2 + sessionOffset) mod totalTracks
//   dayIndex      = days elapsed since EPOCH
//   sessionOffset = 0 for morning posts (hour < 12), 1 for evening posts
//
// With N tracks and 2 posts/day every track plays exactly once before any
// repeats — minimum gap = (N/2) days. Add more mp3 files to extend the gap.
//
// 2026-06-10: cultural/* tracks quarantined after Content ID match against
// "Silk Road" (Elite Alliance Music) on the first long-form Short. Pool is
// down to 4 ambient/inspirational tracks — minimum gap is 2 days. If another
// track gets flagged we'll need a new source.
//
// Side effect: appends a one-line JSONL record to music/_usage-log.jsonl so
// any future Content ID claim can be traced back to the exact track + date
// without grepping cron logs. The log is gitignored.
export async function pickMusicTrack(mood: MusicMood = "ambient"): Promise<string | undefined> {
  void mood; // intentionally unused — full-pool rotation overrides per-mood picks
  const tracks = await getAllTracks();
  if (tracks.length === 0) {
    log("MusicPicker", "warn", "Music pool is empty — video will render silent. Add tracks to music/{ambient,inspirational,cultural}/");
    return undefined;
  }

  const dayIndex     = Math.floor((Date.now() - EPOCH) / (24 * 60 * 60 * 1000));
  const sessionOffset = new Date().getHours() < 12 ? 0 : 1;
  const idx          = (dayIndex * 2 + sessionOffset) % tracks.length;
  const picked       = tracks[idx];

  // Record usage so we can audit which track was used on a given day later.
  try {
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      track: path.basename(picked),
      dayIndex,
      sessionOffset,
      poolSize: tracks.length,
    }) + "\n";
    await fs.appendFile(USE_LOG, line).catch(() => {});
  } catch { /* non-fatal */ }

  return picked;
}
