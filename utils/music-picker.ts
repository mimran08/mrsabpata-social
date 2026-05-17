import * as fs from "node:fs/promises";
import * as path from "node:path";

export type MusicMood = "inspirational" | "ambient" | "cultural";

const MUSIC_DIR = path.join(process.cwd(), "music");

// Fixed epoch — change this if you add/remove tracks to reset the cycle
const EPOCH = new Date("2026-01-01").getTime();

// Collect every .mp3 across all mood subdirectories, sorted alphabetically
// for a deterministic, stable ordering that doesn't change between runs.
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
// With 6 tracks and 2 posts/day every track plays exactly once before any
// repeats — a 3-day gap minimum.  Add more mp3 files to extend the gap.
//
// The `mood` parameter is kept for API compatibility but is not used for
// selection; cycling the full pool gives better variety than mood buckets
// of only 2 tracks each.
export async function pickMusicTrack(mood: MusicMood = "ambient"): Promise<string | undefined> {
  void mood; // intentionally unused — full-pool rotation overrides per-mood picks
  const tracks = await getAllTracks();
  if (tracks.length === 0) return undefined;

  const dayIndex     = Math.floor((Date.now() - EPOCH) / (24 * 60 * 60 * 1000));
  const sessionOffset = new Date().getHours() < 12 ? 0 : 1;
  const idx          = (dayIndex * 2 + sessionOffset) % tracks.length;
  return tracks[idx];
}
