#!/usr/bin/env tsx
/**
 * One-shot YouTube Short upload test — uses today's morning post content and video.
 * Run: npx tsx --env-file=.env.local run-yt-only.ts
 */
import { uploadYouTubeShort } from "./platforms/youtube-browser.js";
import * as fs from "node:fs/promises";

const videoPath = "company/post-videos/2026-05-12-morning.mp4";
const postPath = "company/daily-posts/2026-05-12-morning.md";

async function main() {
  const md = await fs.readFile(postPath, "utf-8").catch(() => null);
  if (!md) { console.error("Post file not found:", postPath); process.exit(1); }

  // Extract YouTube section
  const ytMatch = md.match(/## YouTube Shorts[^\n]*\n\n([\s\S]+?)(?:\n---|\n*$)/);
  const ytText = ytMatch?.[1]?.trim() ?? "Sweden Mein IT Job Bina Degree Ke\nSweden IT jobs under 5% unemployment #SwedenJobs";

  console.log("▶ Uploading to YouTube...");
  console.log("  Video:", videoPath);
  console.log("  Text:", ytText.slice(0, 80), "...");
  console.log();

  await uploadYouTubeShort(ytText, videoPath);
  console.log("\n✅ Done — check YouTube Studio to confirm it's Public (not Draft)");
}

main().catch(err => { console.error("❌ Failed:", err.message); process.exit(1); });
