// Derive the structured video script {title, hook, points, cta, tone, music_mood}
// from the existing per-platform posts object. Avoids a separate Groq call —
// reuses what the news/quote/general generators already produced.
import type { MusicMood } from "./music-picker.js";

export interface ScriptDict {
  title: string;
  hook: string;
  points: string[];      // 2-4 supporting points; one per scene
  cta: string;
  tone: "informative" | "motivational" | "humorous";
  music_mood: MusicMood;
  // Optional richer fields used by pacingMode "many-short" to add visual variety
  stat?: string;         // Big number/fact for a dedicated "stat" scene (e.g. "SEK 33,390")
  actionLine?: string;   // Short imperative for an "action" scene (e.g. "Migrationsverket.se par check karo")
}

export interface PostsForScript {
  x: string;
  instagram: string;
  tiktok: string;
  youtube: string;
  stat: string;
  subtext: string;
  pillar: string;
  theme: string;
}

const MAX_POINTS = 5;
const MIN_POINTS = 2;
const MAX_POINT_CHARS = 140;  // keep each point readable on a vertical phone screen
const SECTION_HEADER = /^[A-Z][\w\s]{0,30}:\s*$/;  // "Healthcare:" / "Major categories:"

// Pillar → tone/music. Pillar 1 (visa) and 2 (jobs) are practical/informative.
// Pillar 3 (stories) is motivational. Pillar 4 (faith/life) is calm/inspirational.
const PILLAR_DEFAULTS: Record<string, { tone: ScriptDict["tone"]; music_mood: MusicMood }> = {
  "1": { tone: "informative", music_mood: "ambient" },
  "2": { tone: "informative", music_mood: "ambient" },
  "3": { tone: "motivational", music_mood: "cultural" },
  "4": { tone: "informative", music_mood: "inspirational" },
};

export function buildScriptDict(posts: PostsForScript): ScriptDict {
  const title = (posts.stat || posts.theme || "Sweden update").trim();
  const hook = deriveHook(posts);
  const points = derivePoints(posts);
  const cta = "Follow @MrSabPata for Sweden visa, jobs & life — link in bio.";
  const defaults = PILLAR_DEFAULTS[posts.pillar] ?? PILLAR_DEFAULTS["1"];

  const stat = deriveStat(posts);
  const actionLine = deriveActionLine(points, [posts.tiktok, posts.x]);

  return { title, hook, points, cta, tone: defaults.tone, music_mood: defaults.music_mood, stat, actionLine };
}

// Stat scene text — only return a distinct number-heavy line, NOT the bare theme.
// If posts.stat is the same as the theme (typical for post-bank entries), or has no
// number, skip the stat scene rather than duplicate the hook.
function deriveStat(posts: PostsForScript): string | undefined {
  const numericPattern = /\b(SEK\s*[\d,]+|\d+\s*(saal|year|%|months|mahine|jobs|professions)|\d{4,}|\d+%)\b/i;

  // Only use posts.stat if it actually contains a number (not just the bare theme)
  if (posts.stat && numericPattern.test(posts.stat) && posts.stat.length <= 60) {
    return posts.stat.trim();
  }

  // Mine instagram body for a number-heavy line. Split on NEWLINES or
  // SENTENCE BOUNDARIES (period+space) — NOT on bare periods, otherwise
  // "Migrationsverket.se" becomes "Migrationsverket" + "se → ...".
  const lines = posts.instagram
    .split(/\n+|(?<=[.!?])\s+/)
    .map(l => l.trim())
    .filter(l => l.length >= 15 && l.length <= 120 && !SECTION_HEADER.test(l));
  return lines.find(l => numericPattern.test(l));
}

// Action scene text — only return if a clear imperative is present. No fallback to
// "last point" because that guarantees duplication with the points section.
// Searches points first, then falls through to tiktok text (which is usually more
// imperative-heavy than the Instagram body).
function deriveActionLine(points: string[], extraSources: string[] = []): string | undefined {
  const imperatives = /\b(karo|check|apply|appl(?:y|ied)|register|enroll|search|book|inform|update|prepare|review|visit|email|speak|join|negotiate|contact|verify|enable|follow|read|listen|track|monitor|book)\b/i;
  // Walk points in reverse so we prefer the most recent imperative
  for (const p of points.slice().reverse()) {
    if (imperatives.test(p) && p.length <= 140) return p;
  }
  // Try extra sources (tiktok body, x body) — split into sentences and find first imperative
  for (const src of extraSources) {
    const sentences = src.replace(/#\S+/g, "").split(/[\n.!?]+/).map(s => s.trim()).filter(s => s.length >= 15 && s.length <= 140);
    for (const s of sentences) {
      if (imperatives.test(s)) return s;
    }
  }
  return undefined;
}

// Hook: one line that stops the scroll. Prefer `stat + subtext` when stat is a short
// punchy fact. Fall back to first sentence of Instagram body.
function deriveHook(posts: PostsForScript): string {
  if (posts.stat && posts.subtext && posts.stat.length <= 60) {
    return `${posts.stat.trim()} — ${posts.subtext.trim()}`;
  }
  if (posts.stat && posts.stat.length <= 100) return posts.stat.trim();
  // Fall back to the first sentence of Instagram body
  const firstSentence = posts.instagram.split(/(?<=[.!?])\s+/).find(s => s.trim().length > 10);
  return (firstSentence || posts.theme || "Sweden update").trim().slice(0, 120);
}

// Parse bullets out of the Instagram body. Two strategies tried in order:
// 1. Numbered/bulleted lines ("1.", "2.", "•", "—")
// 2. Sentence chunking (3 substantial sentences, skipping the first since it's the hook)
function derivePoints(posts: PostsForScript): string[] {
  const body = posts.instagram || "";

  // Strategy 1 — explicit bullets/numbered lines
  const lines = body.split(/\n+/);
  const bulleted = lines
    .map(l => l.trim())
    .filter(l => /^(?:\d+\.\s|\d+\)\s|[•\-—]\s)/.test(l))
    .map(l => l.replace(/^(?:\d+\.\s|\d+\)\s|[•\-—]\s)/, "").trim())
    .filter(l => l.length >= 10);

  if (bulleted.length >= MIN_POINTS) {
    return condensePoints(bulleted.slice(0, MAX_POINTS));
  }

  // Strategy 2 — line + sentence chunking from Instagram body.
  // Many posts use comma-list bullets (e.g. "Nurses, doctors, midwives") that
  // aren't terminated by `.`, so we split on newlines first, then within each
  // line on sentence boundaries. Section headers ("Healthcare:") are dropped.
  const noHashtags = body.replace(/#\S+/g, "").trim();
  const lineChunks = noHashtags.split(/\n+/)
    .map(l => l.trim())
    .filter(l => l && !SECTION_HEADER.test(l));

  // For each line, either keep it as-is (if short enough and substantive) or
  // split it further on sentence boundaries.
  const candidates: string[] = [];
  for (const line of lineChunks) {
    // Strip leading label-headers ("Healthcare: Nurses..." → "Nurses...")
    const stripped = line.replace(/^[A-Z][\w\s]{0,30}:\s+/, "");
    if (stripped.length < 25) continue;  // skip fragments like "AI/ML engineers"
    if (stripped.length <= 200) {
      candidates.push(stripped);
    } else {
      // Long line — split on sentence boundaries
      const sentences = stripped.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s.length >= 20 && s.length <= 200);
      candidates.push(...sentences);
    }
  }

  // Skip the first candidate (typically used for the hook) and take next MAX_POINTS
  const points = candidates.slice(1, 1 + MAX_POINTS);

  if (points.length >= MIN_POINTS) {
    return condensePoints(points);
  }

  // Last-ditch fallback — derive points from theme + subtext + first candidate
  const fallback: string[] = [];
  if (posts.subtext) fallback.push(posts.subtext.trim());
  if (posts.theme && posts.theme !== posts.subtext) fallback.push(posts.theme.trim());
  if (candidates[0]) fallback.push(candidates[0]);
  return condensePoints(fallback.slice(0, MAX_POINTS));
}

// Trim each point to a TTS-friendly length without cutting mid-word.
function condensePoints(points: string[]): string[] {
  return points
    .filter(p => p.length > 0)
    .map(p => {
      if (p.length <= MAX_POINT_CHARS) return p;
      const cut = p.slice(0, MAX_POINT_CHARS);
      const lastSpace = cut.lastIndexOf(" ");
      return (lastSpace > MAX_POINT_CHARS - 30 ? cut.slice(0, lastSpace) : cut).trim();
    });
}
