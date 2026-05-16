import { readBrain } from "../company/brain.js";
import { fileMemo } from "../company/memos.js";
import { logAction } from "../utils/logger.js";
import { dateString } from "../utils/time.js";
import { fetchRecentVideos, fetchVideoComments } from "../platforms/youtube.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";

const ROLE = "researcher";

export interface ResearchBrief {
  proposedTopic: string;
  demandLevel: "High" | "Medium" | "Niche";
  competitorCoverage: string;
  audienceSignals: string[];
  trendingHook: string;
  recommendedAngle: string;
  titleSuggestions: string[];
  greenlight: boolean;
  reason: string;
}

export async function researchTopic(topic: string): Promise<ResearchBrief> {
  logAction(ROLE, `Researching: "${topic}"`);

  const brain = await readBrain();
  const today = dateString();

  // Template — populated by Claude when executing this role
  const brief: ResearchBrief = {
    proposedTopic: topic,
    demandLevel: "High",
    competitorCoverage: "Research required — check YouTube search results",
    audienceSignals: [
      "Check comments on top performer videos in brain.json proven_winners",
      "Look for recurring unanswered questions",
    ],
    trendingHook: "Check Migrationsverket news this week",
    recommendedAngle: "The specific sub-angle competitors are missing",
    titleSuggestions: [],
    greenlight: false,
    reason: "Research in progress",
  };

  const filename = `${today}-${topic.toLowerCase().replace(/\s+/g, "-")}.md`;
  const filepath = path.join("company/research", filename);

  await fs.writeFile(filepath, formatBrief(brief), "utf-8");

  await fileMemo({
    from: ROLE,
    to: "ceo",
    date: today,
    subject: `Research Brief: ${topic}`,
    body: `Brief filed at company/research/${filename}`,
    actionRequired: true,
  });

  logAction(ROLE, `Research brief filed: ${filename}`);
  return brief;
}

export async function mineComments(videoTitles: string[]): Promise<string[]> {
  logAction(ROLE, `Mining comments from ${videoTitles.length} videos`);

  const videos = await fetchRecentVideos(10);
  const matching = videos.filter(v =>
    videoTitles.some(t => v.title.toLowerCase().includes(t.toLowerCase().split(" ")[0]))
  );

  const allComments: string[] = [];
  for (const video of matching.slice(0, 3)) {
    const comments = await fetchVideoComments(video.id, 50);
    allComments.push(...comments);
  }

  // Extract questions (lines with ?)
  const questions = allComments.filter(c => c.includes("?"));
  logAction(ROLE, `Mined ${allComments.length} comments — ${questions.length} questions found`);
  return questions;
}

function formatBrief(b: ResearchBrief): string {
  return `# Research Brief: ${b.proposedTopic}

**Demand Level:** ${b.demandLevel}
**Greenlight:** ${b.greenlight ? "Yes" : "No"}
**Reason:** ${b.reason}

## Competitor Coverage
${b.competitorCoverage}

## Audience Signals
${b.audienceSignals.map((s) => `- ${s}`).join("\n")}

## Trending Hook
${b.trendingHook}

## Recommended Angle
${b.recommendedAngle}

## Title Suggestions
${b.titleSuggestions.map((t, i) => `${i + 1}. ${t}`).join("\n")}
`;
}
