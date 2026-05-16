import { runWeeklyStrategy, greenlightVideo, contactImran } from "../roles/ceo.js";
import { researchTopic } from "../roles/researcher.js";
import { writeScript } from "../roles/scriptwriter.js";
import { createThumbnailBrief } from "../roles/thumbnail_designer.js";
import { prepareAllMetadata } from "../roles/social_media.js";
import { run48HourAudit } from "../roles/analyst.js";
import { syncYouTubeData } from "./sync.js";
import { readBrain } from "../company/brain.js";
import { log } from "../utils/logger.js";
import { nextOptimalPublishTime } from "../utils/time.js";

const ROLE = "Company Run";

const PILLAR_TOPICS: Record<string, string[]> = {
  "1": [
    "Sweden visa interview — what they actually ask in 2026",
    "How to write a Sweden visa cover letter that gets approved",
    "Sweden self-employment visa — complete guide for Pakistanis",
    "Sweden family reunification visa timeline — real story",
  ],
  "2": [
    "How to get a Swedish job offer without speaking Swedish",
    "LinkedIn Sweden strategy — what works for immigrant job seekers",
    "IT jobs in Sweden without a degree — is it possible?",
    "Salary negotiation in Sweden — what immigrants need to know",
  ],
  "3": [
    "First 90 days in Sweden — what nobody tells you",
    "Moving from Karachi to Stockholm — real costs, real story",
    "Swedish work culture shock — immigrant perspective",
    "Is Sweden really immigrant-friendly? Honest answer after 3 years",
  ],
  "4": [
    "How faith helped me survive the loneliness of immigration",
    "What I wish I knew before leaving Pakistan",
    "The moment I almost gave up and went back home",
    "Ramadan in Sweden — how I keep my faith abroad",
  ],
};

const PILLAR_TAGS: Record<string, string[]> = {
  "1": ["Sweden visa", "Swedish immigration", "Pakistan to Sweden", "visa interview", "Migrationsverket"],
  "2": ["Sweden jobs", "work in Sweden", "immigrant career", "Swedish work permit", "job search Sweden"],
  "3": ["immigrant story", "Pakistan to Sweden", "moving abroad", "expat life", "life in Sweden"],
  "4": ["Pakistani in Sweden", "Muslim in Sweden", "immigrant life", "faith abroad", "personal story"],
};

export async function runCompany(): Promise<void> {
  log(ROLE, "info", "═══════════════════════════════════════════════════");
  log(ROLE, "info", "  MrSabPata Media Company — Weekly Run Starting");
  log(ROLE, "info", "═══════════════════════════════════════════════════");

  // Step 1: Sync live YouTube data
  log(ROLE, "info", "[1/8] Syncing live YouTube data...");
  await syncYouTubeData();

  // Step 2: Read brain to inform decisions
  const brain = await readBrain();
  const pillar = (brain.active_content_pillar as string) ?? "1";
  const pillarName = (brain.content_pillars as Record<string, string>)?.[pillar] ?? `Pillar ${pillar}`;

  log(ROLE, "info", `[2/8] CEO: Running weekly strategy — active pillar: ${pillar} (${pillarName})`);
  const direction = await runWeeklyStrategy();
  log(ROLE, "info", `      Focus: ${direction.keyFocus}`);

  // Step 3: Pick topic for the active pillar
  log(ROLE, "info", `[3/8] Researcher: Picking topic for Pillar ${pillar}...`);
  const topicOptions = PILLAR_TOPICS[pillar] ?? PILLAR_TOPICS["1"];

  // Pick the first topic not matching any proven winner title
  const provenTitles = ((brain.proven_winners as Array<{ title: string }>) ?? []).map(v => v.title.toLowerCase());
  const freshTopic = topicOptions.find(t => !provenTitles.some(pt => pt.includes(t.split(" ")[0].toLowerCase()))) ?? topicOptions[0];

  log(ROLE, "info", `      Topic selected: "${freshTopic}"`);
  const researchBrief = await researchTopic(freshTopic);
  log(ROLE, "info", `      Research brief filed`);

  // Step 4: CEO greenlights the video
  log(ROLE, "info", `[4/8] CEO: Evaluating greenlight for "${freshTopic}"...`);
  const approved = await greenlightVideo(freshTopic, pillar);
  if (!approved) {
    log(ROLE, "warn", "      CEO BLOCKED this topic — matches banned content. Run again to try next topic.");
    return;
  }
  log(ROLE, "info", `      GREENLIGHTED ✓`);

  // Step 5: Scriptwriter writes the script
  log(ROLE, "info", `[5/8] Scriptwriter: Writing script for "${freshTopic}"...`);
  const scriptPath = `company/research/`;
  await writeScript(freshTopic, pillar, scriptPath);
  log(ROLE, "info", `      Script filed to company/scripts/`);

  // Step 6: Thumbnail designer creates brief + HTML mockup
  log(ROLE, "info", `[6/8] Thumbnail Designer: Creating brief...`);
  const recentVideos = (brain.recent_videos as Array<{ views: number }>) ?? [];
  const avgViews = recentVideos.length > 0
    ? recentVideos.reduce((s, v) => s + v.views, 0) / recentVideos.length
    : 0;
  const ctrLow = avgViews < 1500;
  await createThumbnailBrief(freshTopic, ctrLow);
  log(ROLE, "info", `      Thumbnail brief + HTML mockup filed to company/thumbnails/`);

  // Step 7: Social media prepares metadata for all platforms
  log(ROLE, "info", `[7/8] Social Media: Preparing all platform metadata...`);
  const description = buildYouTubeDescription(freshTopic, pillarName);
  const tags = PILLAR_TAGS[pillar] ?? PILLAR_TAGS["1"];
  await prepareAllMetadata(freshTopic, pillarName, description, tags);
  log(ROLE, "info", `      Metadata filed to company/social/`);

  // Step 8: Analyst audits most recent published video
  const recentPublished = (brain.recent_videos as Array<{ title: string; views: number; published_at: string }> | undefined)?.[0];
  if (recentPublished) {
    log(ROLE, "info", `[8/8] Analyst: Running 48hr audit on "${recentPublished.title}"...`);
    await run48HourAudit(recentPublished.title, {
      views48h: recentPublished.views,
      publishedDate: recentPublished.published_at,
    });
    log(ROLE, "info", `      Audit complete — report in company/analytics/`);
  } else {
    log(ROLE, "info", `[8/8] Analyst: No recent video to audit yet`);
  }

  // Summary for Imran
  const publishDate = nextOptimalPublishTime();
  const publishStr = publishDate.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

  await contactImran(
    `Record Ready: "${freshTopic}"`,
    "Record the next video — script, thumbnail brief, and all platform metadata are ready",
    "All pre-production is complete. Your job is just to record.",
    [
      `1. Read the script at company/scripts/ (most recent file)`,
      `2. Read the thumbnail brief at company/thumbnails/ (most recent -brief.md)`,
      `3. Record the video — energy: warm and direct, talk to a friend`,
      `4. Save raw file to company/recordings/`,
      `5. Aim to publish by ${publishStr}`,
    ],
    "30–60 minutes",
    publishStr,
  );

  log(ROLE, "info", "═══════════════════════════════════════════════════");
  log(ROLE, "info", "  Company run complete. Files generated:");
  log(ROLE, "info", "    company/research/   → research brief");
  log(ROLE, "info", "    company/scripts/    → full recording script");
  log(ROLE, "info", "    company/thumbnails/ → brief + HTML mockup");
  log(ROLE, "info", "    company/social/     → all platform metadata");
  log(ROLE, "info", "    company/analytics/  → performance audit");
  log(ROLE, "info", "    company/imran-inbox/→ recording brief for Imran");
  log(ROLE, "info", `  Next publish target: ${publishStr}`);
  log(ROLE, "info", "═══════════════════════════════════════════════════");
}

function buildYouTubeDescription(title: string, pillar: string): string {
  return `${title}

In this video, I share my honest perspective on this topic from my experience as a Pakistani immigrant in Sweden.

If you're planning to move abroad, navigating the immigration process, or building a career in a new country — this is for you.

---

🔔 Subscribe for weekly videos on Swedish immigration, career advice, and real immigrant life:
https://www.youtube.com/@MrSabPata

📌 Related videos:
[Add 2-3 related videos after recording]

---

📍 Content Pillar: ${pillar}
🌍 From Karachi 🇵🇰 to Stockholm 🇸🇪

#MrSabPata #SwedenImmigrant #PakistaniInSweden #LifeInSweden
`;
}
