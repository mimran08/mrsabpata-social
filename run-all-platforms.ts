#!/usr/bin/env tsx
/**
 * Full platform test — posts tonight's evening content to all 4 platforms.
 * Run: npx tsx --env-file=.env.local run-all-platforms.ts
 */
import { postViaBrowser as postViaX } from "./platforms/x-browser.js";
import { postViaTikTok } from "./platforms/tiktok-browser.js";
import { postViaInstagram } from "./platforms/instagram-browser.js";
import { uploadYouTubeShort } from "./platforms/youtube-browser.js";

const videoPath = "company/post-videos/2026-05-12-evening.mp4";
const imagePath = "company/post-images/2026-05-12-evening.png";

const content = {
  x: "Personnummer takes 4-6 weeks, use Wise! #SwedenLife",
  tiktok: "Personnummer takes 4-6 weeks! Use Wise, honestly. Manage finances easily #SwedenLife #Personnummer #Wise",
  instagram: "Basically, Personnummer takes 4-6 weeks, honestly, use Wise or Revolut in the meantime, okay so, you can manage your finances easily. I mean, it's a game changer for new immigrants, seriously. Stockholm Mein Ghar Dhundhna video coming soon! #SwedenImmigration #Personnummer #Wise #Revolut #SwedenLife #PakistaniInSweden",
  youtube: "Personnummer Timeline - New immigrants use Wise or Revolut for 4-6 weeks, it's a game changer, actually. Manage your finances easily and focus on your new life in Sweden. #SwedenImmigration #Personnummer #Wise",
};

const results: Record<string, string> = {};

async function run(name: string, fn: () => Promise<void>) {
  try {
    console.log(`\n▶ ${name}...`);
    await fn();
    results[name] = "✅ Success";
    console.log(`✅ ${name} done`);
  } catch (err) {
    results[name] = `❌ ${(err as Error).message.slice(0, 100)}`;
    console.error(`❌ ${name} failed:`, (err as Error).message.slice(0, 100));
  }
}

async function main() {
  console.log("=== Full Platform Test — Evening Post ===\n");

  await run("X/Twitter", () => postViaX(content.x, imagePath));
  await new Promise(r => setTimeout(r, 2000));

  await run("TikTok", () => postViaTikTok(content.tiktok, videoPath));
  await new Promise(r => setTimeout(r, 3000));

  await run("Instagram", () => postViaInstagram(content.instagram, videoPath));
  await new Promise(r => setTimeout(r, 3000));

  await run("YouTube", () => uploadYouTubeShort(content.youtube, videoPath));

  console.log("\n=== RESULTS ===");
  for (const [platform, result] of Object.entries(results)) {
    console.log(`  ${platform}: ${result}`);
  }
}

main().catch(err => { console.error("Fatal:", err.message); process.exit(1); });
