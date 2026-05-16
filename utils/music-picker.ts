import * as fs from "node:fs/promises";
import * as path from "node:path";

export type MusicMood = "inspirational" | "ambient" | "cultural";

const MUSIC_DIR = path.join(process.cwd(), "music");

// Pick a random .mp3 from the given mood subdirectory, falling back to the
// base music/ directory if the subdirectory is empty or missing.
export async function pickMusicTrack(mood: MusicMood = "ambient"): Promise<string | undefined> {
  const dirs = [path.join(MUSIC_DIR, mood), MUSIC_DIR];
  for (const dir of dirs) {
    try {
      const files = (await fs.readdir(dir)).filter(f => f.endsWith(".mp3"));
      if (files.length > 0) {
        return path.join(dir, files[Math.floor(Math.random() * files.length)]);
      }
    } catch { /* directory doesn't exist */ }
  }
  return undefined;
}
