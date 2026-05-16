import { readBrain, writeBrain } from "../company/brain.js";
import { fileMemo } from "../company/memos.js";
import { fileImranInbox } from "../company/imran.js";
import { logAction } from "../utils/logger.js";
import { dateString } from "../utils/time.js";

const ROLE = "ceo";

export interface WeeklyDirection {
  week: string;
  contentPillar: "1" | "2" | "3" | "4";
  priorityVideoTitle: string;
  shortsTarget: number;
  keyFocus: string;
  roleAssignments: Record<string, string>;
  imranContactNeeded: boolean;
  decisions: string[];
}

export async function runWeeklyStrategy(): Promise<WeeklyDirection> {
  logAction(ROLE, "Starting weekly strategy session");

  const brain = await readBrain();
  const today = dateString();

  // Determine which pillar needs attention based on data
  const pillar = determinePriorityPillar(brain);

  const direction: WeeklyDirection = {
    week: today,
    contentPillar: pillar,
    priorityVideoTitle: "",
    shortsTarget: 3,
    keyFocus: "Fix 0:22 avg view duration — hooks must deliver in first sentence",
    roleAssignments: {
      researcher: `Research top-demand topic in Pillar ${pillar}`,
      scriptwriter: "Await research brief before starting",
      thumbnail_designer: "Review last video CTR — propose A/B if under 4%",
      social_media: "Post 3 Shorts from existing top performers this week",
      analyst: "Run Monday metrics check — update brain.json",
    },
    imranContactNeeded: false,
    decisions: [],
  };

  await writeBrain({ current_focus: direction.keyFocus, active_content_pillar: pillar });

  await fileMemo({
    from: ROLE,
    to: "all",
    date: today,
    subject: `Weekly Direction — ${today}`,
    body: formatDirectionMemo(direction),
    actionRequired: true,
  });

  logAction(ROLE, `Weekly direction filed — Pillar ${pillar}`);
  return direction;
}

export async function greenlightVideo(title: string, pillar: string): Promise<boolean> {
  logAction(ROLE, `Evaluating greenlight: "${title}"`);

  const brain = await readBrain();
  const bannedList = (brain.banned_content as string[]) ?? [];
  const isBanned = bannedList.some((banned: string) =>
    title.toLowerCase().includes(banned.toLowerCase()),
  );

  if (isBanned) {
    logAction(ROLE, `BLOCKED: "${title}" matches banned content`);
    return false;
  }

  await writeBrain({
    next_video: {
      title,
      pillar,
      script_status: "not_started",
      recording_brief_sent: false,
      publish_date: "",
    },
  });

  logAction(ROLE, `GREENLIGHTED: "${title}"`);
  return true;
}

export async function contactImran(subject: string, what: string, why: string, steps: string[], timeNeeded: string, deadline: string): Promise<void> {
  logAction(ROLE, `Contacting Imran: ${subject}`);
  await fileImranInbox({ subject, what, why, steps, timeNeeded, deadline });
}

function determinePriorityPillar(brain: Record<string, unknown>): "1" | "2" | "3" | "4" {
  // Pillar 1 (Visa) is always the highest-demand — default to it unless recent
  return (brain.active_content_pillar as "1" | "2" | "3" | "4") ?? "1";
}

function formatDirectionMemo(d: WeeklyDirection): string {
  return [
    `WEEK: ${d.week}`,
    `Content Pillar: ${d.contentPillar}`,
    `Shorts Target: ${d.shortsTarget} this week`,
    `Key Focus: ${d.keyFocus}`,
    ``,
    `ROLE ASSIGNMENTS:`,
    ...Object.entries(d.roleAssignments).map(([role, task]) => `  ${role}: ${task}`),
    ``,
    `IMRAN CONTACT NEEDED: ${d.imranContactNeeded ? "yes" : "no"}`,
  ].join("\n");
}
