#!/usr/bin/env tsx
/**
 * Posts today's morning content to TikTok and Instagram using the already-generated video.
 * Run: npx tsx --env-file=.env.local run-tiktok-instagram.ts
 */
import { postViaTikTok } from "./platforms/tiktok-browser.js";
import { postViaInstagram } from "./platforms/instagram-browser.js";

const videoPath = "company/post-videos/2026-05-12-morning.mp4";

const tiktokCaption = "Sweden IT jobs under 5% unemployment, skills matter, portfolio non-negotiable #SwedenJobs #ITJobs #CareerInSweden";

const instagramCaption = "I mean, honestly, Sweden mein IT jobs ki unemployment rate under 5% hai, basically sabse low. Okay so, skills, visa, work permit, deadline, documents, process, platform, profile, timeline, sab ko samajhna zaroori hai. Seriously, IT job in Sweden bina degree ke possible hai, lekin 12-18 months lagte hain. Portfolio non-negotiable hai, okay? #SwedenJobs #ITJobs #PakistanisInSweden #SwedenImmigration #CareerInSweden #JobSearch";

async function main() {
  console.log("▶ Posting to TikTok...");
  try {
    await postViaTikTok(tiktokCaption, videoPath);
    console.log("✅ TikTok done");
  } catch (err) {
    console.error("❌ TikTok failed:", (err as Error).message);
  }

  await new Promise(r => setTimeout(r, 3000));

  console.log("\n▶ Posting to Instagram...");
  try {
    await postViaInstagram(instagramCaption, videoPath);
    console.log("✅ Instagram done");
  } catch (err) {
    console.error("❌ Instagram failed:", (err as Error).message);
  }
}

main().catch(err => { console.error("Fatal:", err.message); process.exit(1); });
