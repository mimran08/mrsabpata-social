import { logAction } from "../utils/logger.js";
import { dateString } from "../utils/time.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";

const ROLE = "social_media";

export interface SocialPost {
  platform: "youtube" | "tiktok" | "instagram" | "x";
  caption: string;
  hashtags: string[];
  publishAt: string;
}

export interface PublishLog {
  date: string;
  videoTitle: string;
  contentPillar: string;
  platforms: {
    youtube?: { url: string; publishedAt: string; status: "live" | "scheduled" | "failed" };
    tiktok?: { url: string; publishedAt: string; status: "live" | "scheduled" | "failed" };
    instagram?: { url: string; publishedAt: string; status: "live" | "scheduled" | "failed" };
    x?: { url: string; publishedAt: string; status: "live" | "scheduled" | "failed" };
  };
  packaging: {
    titleUsed: string;
    thumbnailConcept: string;
  };
}

export async function prepareAllMetadata(
  videoTitle: string,
  pillar: string,
  description: string,
  tags: string[],
): Promise<void> {
  logAction(ROLE, `Preparing metadata for: "${videoTitle}"`);

  const today = dateString();
  const slug = videoTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const filename = `${today}-${slug}-metadata.md`;

  const content = formatMetadata(videoTitle, pillar, description, tags);
  await fs.writeFile(path.join("company/social", filename), content, "utf-8");

  logAction(ROLE, `Metadata filed: ${filename}`);
}

export async function logPublish(log: PublishLog): Promise<void> {
  logAction(ROLE, `Logging publish: "${log.videoTitle}"`);

  const filename = `${log.date}.json`;
  await fs.writeFile(
    path.join("company/published", filename),
    JSON.stringify(log, null, 2),
    "utf-8",
  );

  logAction(ROLE, `Publish logged: ${filename}`);
}

function formatMetadata(title: string, pillar: string, description: string, tags: string[]): string {
  return `# Platform Metadata: ${title}

**Content Pillar:** ${pillar}

---

## YouTube

**Title:** ${title}

**Description:**
${description}

**Timestamps:** [Add after recording]

**Tags:**
${tags.join(", ")}

**Hashtags:** #SwedenImmigrant #PakistaniInSweden #MrSabPata

**Cards:** 2 cards at retention dip timestamps
**End Screen:** Top performer + most recent video + subscribe
**Language:** Urdu (ur) | English captions enabled

---

## TikTok

**Caption Line 1 (hook, max 100 chars — no sound context):**
[Hook — name the pain or promise immediately]

**Hashtags:** #SwedenLife #ImmigrantLife #PakistaniAbroad

**2-Second Test:** Does first frame + first line stop the scroll?

---

## Instagram Reel

**Caption:**
[Hook line]

[Personal, warm follow-up — 2-3 lines, like talking to a friend]

[Hashtags — 25-30 across niche/mid/broad tiers]
#SwedenImmigrant #PakistaniInSweden #LifeInSweden
#ImmigrantLife #ExpatLife #MovingAbroad
#Immigration #Pakistan #Sweden #Diaspora

**Stories (3 slides):**
- Slide 1: Hook question from the video
- Slide 2: 1 key insight — text on image
- Slide 3: "Full video on YouTube — link in bio" + poll

---

## X (Twitter) Thread

**Tweet 1:** [Most provocative truth from video — NO link yet]
**Tweet 2:** [Personal story beat]
**Tweet 3:** [Counterintuitive truth nobody else says]
**Tweet 4:** [Practical takeaway]
**Tweet 5:** "Full story in today's video 👇" + YouTube link

**Tone:** Direct. Has a POV. Says what others won't.
`;
}
