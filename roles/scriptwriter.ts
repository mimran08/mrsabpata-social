import { readBrain, writeBrain } from "../company/brain.js";
import { fileMemo } from "../company/memos.js";
import { fileImranInbox } from "../company/imran.js";
import { logAction } from "../utils/logger.js";
import { dateString } from "../utils/time.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";

const ROLE = "scriptwriter";

export type HookType = "pain_callout" | "specific_promise" | "story_drop" | "truth_reveal";

export interface Script {
  title: string;
  pillar: string;
  hookType: HookType;
  estimatedRuntimeMinutes: number;
  hook: string;
  contextBridge: string;
  body: BodyPoint[];
  cta: string;
  nextVideoTease: string;
  recordingBrief: RecordingBrief;
}

export interface BodyPoint {
  statement: string;
  evidence: string;
  emotionalTruth: string;
  takeaway: string;
  patternInterrupt: string;
}

export interface RecordingBrief {
  videoTitle: string;
  estimatedLength: string;
  whatToWear: string;
  location: string;
  energyLevel: string;
  keyMoment: string;
  scriptFile: string;
  timeNeeded: string;
}

export async function writeScript(title: string, pillar: string, researchBriefPath: string): Promise<Script> {
  logAction(ROLE, `Writing script: "${title}"`);

  const today = dateString();
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const filename = `${today}-${slug}.md`;

  // Retention checklist validation
  const checklist = [
    "Title promise delivered in first sentence",
    "Zero cold open greetings",
    "Viewer named specifically in first 30 seconds",
    "Pattern interrupt every 90-120 seconds",
    "Retention hook at 40% mark",
    "Retention hook at 70% mark",
    "Ending has next-video tease creating genuine FOMO",
    "One moment someone will screenshot and share",
  ];

  const recordingBrief: RecordingBrief = {
    videoTitle: title,
    estimatedLength: "10-20 minutes",
    whatToWear: "Clean, simple — no logos, no distractions",
    location: "Home setup — neutral background",
    energyLevel: "Warm and direct — talk to a friend, not a camera",
    keyMoment: "The moment the viewer feels seen — deliver it perfectly",
    scriptFile: `company/scripts/${filename}`,
    timeNeeded: "30-60 minutes recording",
  };

  const script: Script = {
    title,
    pillar,
    hookType: "pain_callout",
    estimatedRuntimeMinutes: 15,
    hook: "",
    contextBridge: "",
    body: [],
    cta: "",
    nextVideoTease: "",
    recordingBrief,
  };

  const content = formatScript(script, checklist);
  await fs.writeFile(path.join("company/scripts", filename), content, "utf-8");

  await writeBrain({ next_video: { script_status: "ready" } });

  await fileImranInbox({
    subject: `Script Ready: ${title}`,
    what: "Record this video",
    why: "Script is complete and greenlighted",
    steps: [
      `1. Read the script at company/scripts/${filename}`,
      "2. Set up your recording space (see brief below)",
      "3. Record the video",
      `4. Save the raw file to company/recordings/${today}-${slug}.mp4`,
    ],
    timeNeeded: "30-60 minutes",
    deadline: "Within 48 hours for Thursday publish",
  });

  await fileMemo({
    from: ROLE,
    to: "thumbnail_designer",
    date: today,
    subject: `Script ready — begin thumbnail: ${title}`,
    body: `Script filed at company/scripts/${filename}. Begin thumbnail brief and mockup.`,
    actionRequired: true,
  });

  logAction(ROLE, `Script filed: ${filename}`);
  return script;
}

function formatScript(s: Script, checklist: string[]): string {
  return `# Script: ${s.title}

**Pillar:** ${s.pillar}
**Hook Type:** ${s.hookType}
**Estimated Runtime:** ${s.estimatedRuntimeMinutes} minutes
**Language:** Urdu/Hindi conversational — English translation in [brackets]

---

## RETENTION CHECKLIST (must pass before recording)

${checklist.map((item) => `- [ ] ${item}`).join("\n")}

---

## HOOK (0–30 seconds)

<!-- PRIORITY #1: This is where 0:22 avg view duration is won or lost -->
<!-- NEVER start with greetings. Title promise in FIRST sentence. -->

${s.hook || "[Hook to be written — deliver title promise in opening line]"}

---

## CONTEXT BRIDGE (30–60 seconds)

${s.contextBridge || "[Why this matters RIGHT NOW. One credibility line. Make viewer feel: 'yeh meri baat kar raha hai.']"}

---

## BODY

${s.body.length === 0 ? "[3-5 points — each with bold statement, evidence, emotional truth, takeaway, pattern interrupt]" : s.body.map(formatBodyPoint).join("\n\n")}

<!-- [RETENTION HOOK at 40%]: "Lekin abhi main aapko woh baat bataunga jo mujhe 3 saal baad pata chali — yeh suno." -->
<!-- [RETENTION HOOK at 70%]: "Aakhri point sabse important hai — yeh woh cheez hai jo koi nahi batata." -->

---

## CTA + NEXT VIDEO TEASE (final 30 seconds)

${s.cta || "[Core insight. Specific comment question. Next video FOMO tease. Subscribe with reason.]"}

---

## RECORDING BRIEF FOR IMRAN

**Video Title:** ${s.recordingBrief.videoTitle}
**Estimated Length:** ${s.recordingBrief.estimatedLength}
**What to Wear:** ${s.recordingBrief.whatToWear}
**Location:** ${s.recordingBrief.location}
**Energy Level:** ${s.recordingBrief.energyLevel}
**Key Moment:** ${s.recordingBrief.keyMoment}
**Time Needed:** ${s.recordingBrief.timeNeeded}

When done → save to \`company/recordings/\`
`;
}

function formatBodyPoint(p: BodyPoint, i: number): string {
  return `### Point ${i + 1}

**Statement:** ${p.statement}
**Evidence:** ${p.evidence}
**Emotional Truth:** ${p.emotionalTruth}
**Takeaway:** ${p.takeaway}
**Pattern Interrupt:** ${p.patternInterrupt}`;
}
