// ─────────────────────────────────────────────────────────────────────────────
// QUALITY GATE — THE MOST IMPORTANT FILE IN THE COMPANY
//
// Per docs/COMPANY-PROMPT.md PART 5: "This is what was missing before. This
// is what caused the Ahmed disaster. Every piece of content must pass the
// Quality Gate before it is published. No exceptions."
//
// Runs synchronously before every publish call. Returns:
//   { approved: true, warnings: [...] }  — safe to publish
//   { approved: false, errors: [...] }   — BLOCK publish, fix all errors
//
// Backed by company/brain.json — banned lists + pillar definitions live there
// so updating the rules is a JSON edit, not a code change.
// ─────────────────────────────────────────────────────────────────────────────

import * as fs from "node:fs/promises";
import * as path from "node:path";

export type ContentType = "long_form" | "short" | "instagram_reel" | "tiktok" | "twitter";

export interface QualityGateInput {
  type: ContentType;
  title: string;
  description: string;
  tags?: string[];
  pillar?: string;
  hasRealFaceThumbnail?: boolean;       // true if Imran on camera OR clean branded text Short
  thumbnailElements?: string[];          // ["red_stamp", "clock_graphic", ...] if any of these are present
  previousVideoRetentionPct?: number;    // last video's avg view duration %; warns if <30
  weeklySubChange?: number;              // negative number warns if < -20
}

export interface QualityGateResult {
  approved: boolean;
  errors: string[];
  warnings: string[];
  action: string;
}

interface Brain {
  banned_forever: string[];
  content_pillars: Record<string, { label: string; priority: number }>;
  failed_experiments: Array<{ name?: string; title?: string; type: string }>;
}

let brainCache: Brain | null = null;

async function loadBrain(): Promise<Brain> {
  if (brainCache) return brainCache;
  const brainPath = path.join("company", "brain.json");
  brainCache = JSON.parse(await fs.readFile(brainPath, "utf-8")) as Brain;
  return brainCache;
}

// Names ALWAYS banned in title/description, regardless of context. The list
// is duplicated here (not just in brain.json) so the gate fails closed even
// if brain.json is missing or malformed.
const HARD_BANNED_CHARACTERS = ["ahmed", "fatima", "bilal"];

// Template patterns that indicate raw AI placeholder text leaked through.
const TEMPLATE_PATTERNS = [
  "Title:", "Description:", "Theme:", "Pillar:",
  "[INSERT", "HOOK HERE", "ADD HOOK", "PLACEHOLDER",
  "{{", "}}", "TODO:", "FIXME:",
];

// Thumbnail elements that get a hard block (the "Bina IELTS Visa Direct"
// disaster pattern — news-channel style chaos).
const BANNED_THUMBNAIL_ELEMENTS = [
  "red_stamp", "clock_graphic", "yellow_urgent_text",
  "multiple_text_blocks", "news_channel_style", "dark_animated_character",
  "emoji_overload",
];

// Topics outside the 4 pillars — instant block. Off-niche content like
// the Oura Ring review (25 views, worst ever) trains the algorithm wrong.
const OFF_NICHE_TAG_BLOCKLIST = [
  "product review", "product_review", "oura ring", "tech review",
  "unboxing", "general motivation", "no sweden angle", "no_sweden_angle",
];

const VALID_PILLARS = new Set([
  "visa_immigration", "jobs_career", "immigrant_stories", "personal_faith",
]);

export async function qualityGate(input: QualityGateInput): Promise<QualityGateResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Load brain (best effort — fall through to hardcoded lists if missing)
  let brain: Brain | null = null;
  try { brain = await loadBrain(); } catch { /* fall back to hardcoded */ }

  const titleLower = (input.title || "").toLowerCase();
  const descLower  = (input.description || "").toLowerCase();
  const combinedText = `${input.title || ""} ${input.description || ""}`;

  // ═══ CRITICAL CHECKS — any failure = BLOCK publish ═══════════════════════

  // 1. NO FICTIONAL CHARACTERS (the Ahmed disaster)
  for (const name of HARD_BANNED_CHARACTERS) {
    if (titleLower.includes(name) || descLower.includes(name)) {
      errors.push(`BLOCKED: Contains banned fictional character name "${name}". MrSabPata features Imran only — see docs/COMPANY-PROMPT.md PART 7.`);
    }
  }

  // 2. NO RAW AI TEMPLATE TEXT
  for (const pattern of TEMPLATE_PATTERNS) {
    if (combinedText.includes(pattern)) {
      errors.push(`BLOCKED: Raw template text found: "${pattern}" — edit before publishing (PART 1 MISTAKE 2).`);
    }
  }

  // 3. SHORTS REQUIRE REAL FACE OR BRANDED THUMBNAIL
  if (input.type === "short" && input.hasRealFaceThumbnail === false) {
    errors.push("BLOCKED: Shorts require Imran's real face on camera OR a clean branded text-only Short (PART 7). Dark animated character drama is banned.");
  }

  // 4. NO OFF-NICHE CONTENT
  const tagsLower = (input.tags || []).map(t => t.toLowerCase());
  for (const blocked of OFF_NICHE_TAG_BLOCKLIST) {
    if (tagsLower.includes(blocked)) {
      errors.push(`BLOCKED: Off-niche tag "${blocked}". Must fit one of the 4 pillars (PART 6).`);
    }
  }

  // 5. VALID PILLAR REQUIRED
  if (input.pillar && !VALID_PILLARS.has(input.pillar)) {
    errors.push(`BLOCKED: Pillar "${input.pillar}" not recognised. Must be: ${[...VALID_PILLARS].join(" | ")}.`);
  }

  // 6. THUMBNAIL HAS BANNED ELEMENTS
  for (const el of input.thumbnailElements || []) {
    if (BANNED_THUMBNAIL_ELEMENTS.includes(el)) {
      errors.push(`BLOCKED: Thumbnail contains banned element "${el}" (PART 11).`);
    }
  }

  // ═══ WARNING CHECKS — flag but allow publish ═════════════════════════════

  // 7. TITLE LENGTH — mobile truncates ≥ 60
  if (input.title.length > 60) {
    warnings.push(`WARNING: Title is ${input.title.length} chars — truncates on mobile at 60 (PART 12 YOUTUBE).`);
  }

  // 8. RETENTION CHECK
  if (input.previousVideoRetentionPct !== undefined && input.previousVideoRetentionPct < 30) {
    warnings.push(`WARNING: Last video had ${input.previousVideoRetentionPct}% retention (<30). Has the hook been fixed? (PART 10).`);
  }

  // 9. SUB LOSS CHECK
  if (input.weeklySubChange !== undefined && input.weeklySubChange < -20) {
    warnings.push(`WARNING: Channel losing ${Math.abs(input.weeklySubChange)} subs/week. CEO review needed (PART 15 EMERGENCY 1).`);
  }

  // 10. PILLAR REQUIRED
  if (!input.pillar) {
    warnings.push("WARNING: No content pillar assigned. Quality Gate will require this for full block in next release.");
  }

  // Extra defensive check using brain.json's failed_experiments list
  if (brain) {
    for (const exp of brain.failed_experiments) {
      const failedName = (exp.name || "").toLowerCase();
      if (failedName && (titleLower.includes(failedName) || descLower.includes(failedName))) {
        errors.push(`BLOCKED: References failed experiment "${exp.name}" (brain.json — type=${exp.type}).`);
      }
    }
  }

  // ═══ Build result ═══════════════════════════════════════════════════════

  if (errors.length > 0) {
    return {
      approved: false,
      errors,
      warnings,
      action: "HOLD — do not publish. Fix all errors first.",
    };
  }

  return {
    approved: true,
    errors: [],
    warnings,
    action: warnings.length > 0 ? "APPROVED WITH WARNINGS — review before publishing." : "APPROVED — publish.",
  };
}

// Thin convenience wrapper for posters: throws on block so the calling code
// doesn't need to check `.approved`. Logs warnings via console (callers can
// pipe to their own logger if needed).
export async function assertPublishable(input: QualityGateInput, logger?: (level: "info" | "warn", msg: string) => void): Promise<void> {
  const result = await qualityGate(input);
  const log = logger ?? ((level, msg) => console[level === "warn" ? "warn" : "log"](`[QualityGate] ${msg}`));

  for (const w of result.warnings) log("warn", w);

  if (!result.approved) {
    for (const e of result.errors) log("warn", e);
    throw new Error(`Quality Gate BLOCKED publish (${result.errors.length} error(s)):\n  - ${result.errors.join("\n  - ")}`);
  }

  log("info", result.action);
}
