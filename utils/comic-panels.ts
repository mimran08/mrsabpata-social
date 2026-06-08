// Generate comic-style story panels via Gemini 2.5 Flash Image (nano-banana).
// Each panel uses the character reference PNG as image input so Ahmed/Fatima/
// Bilal stay visually consistent across panels and across days.
//
// Input: a `panels` array from the daily Groq output, each entry describing
// which character(s) appear and the scene. We render one PNG per panel and
// return the paths — the video renderer cycles through them as scene
// backgrounds (replacing Pixabay stock images for story posts).

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { log } from "./logger.js";

const ROLE = "COMIC-PANELS";
const MODEL = "gemini-2.5-flash-image";
const CHARACTERS_DIR = path.join("company", "characters");
const SCENES_DIR = path.join(CHARACTERS_DIR, "scenes");

// Consistent style spec — keep aligned with how the character refs were
// generated (scripts/gen-characters.ts STYLE constant).
const STYLE_BIBLE = "modern comic book illustration — bold clean black ink outlines, flat color fill with light cel shading, vertical 9:16 panel composition. No text, no speech bubbles, no captions inside the image. Cinematic angle. Warm color palette.";

// Per-character descriptions — appended to the prompt when that character
// appears so the model has both the visual ref AND a textual anchor.
const CHAR_DESC: Record<string, string> = {
  ahmed:  "Ahmed: 28 year old Pakistani man, short black hair, light beard, thin black glasses, navy blue zip-up hoodie over white t-shirt, dark jeans. Match the reference image exactly.",
  fatima: "Fatima: 27 year old Pakistani woman, black hair in a loose low ponytail, no head covering, modest knee-length burgundy long-sleeve dress with a matching scarf draped over one shoulder, black leggings, beige flat shoes. Match the reference image exactly.",
  bilal:  "Bilal: 35 year old Pakistani man, short black hair with subtle grey at temples, clean shaven, olive green wool cardigan over grey t-shirt, dark slim chinos, brown leather Chelsea boots. Match the reference image exactly.",
};

export interface PanelSpec {
  /** Which characters appear. Accepts single name, "both" (ahmed+bilal), "all", or comma-separated. */
  character: string;
  /** Scene description — no dialogue, no on-screen text, just a visual moment. */
  scene: string;
}

export interface GenerateOptions {
  panels: PanelSpec[];
  /** Used to namespace the output dir, e.g. "2026-06-08-evening". */
  filename: string;
}

function parseCharacters(spec: string): string[] {
  const norm = spec.toLowerCase().trim();
  if (norm === "all") return ["ahmed", "fatima", "bilal"];
  if (norm === "both") return ["ahmed", "bilal"]; // historical alias from the sample script
  return norm.split(/[,+&]\s*|\s+and\s+/).map(s => s.trim()).filter(s => CHAR_DESC[s]);
}

async function loadCharRef(slug: string): Promise<{ mimeType: string; data: string }> {
  const p = path.join(CHARACTERS_DIR, `${slug}-ref.png`);
  const buf = await fs.readFile(p);
  return { mimeType: "image/png", data: buf.toString("base64") };
}

async function renderOne(panel: PanelSpec, outPath: string, key: string): Promise<void> {
  const chars = parseCharacters(panel.character);
  if (chars.length === 0) throw new Error(`unknown character spec: "${panel.character}"`);

  const refParts: Array<{ inlineData: { mimeType: string; data: string } }> = [];
  let charBlock = "";
  for (const c of chars) {
    refParts.push({ inlineData: await loadCharRef(c) });
    charBlock += CHAR_DESC[c] + " ";
  }

  const prompt = `${STYLE_BIBLE}\n\nCharacters in this panel: ${charBlock.trim()}\n\nScene: ${panel.scene}`;

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [...refParts, { text: prompt }] }] }),
  });

  const data = await res.json() as {
    candidates?: Array<{ content: { parts: Array<{ inlineData?: { mimeType: string; data: string }; text?: string }> } }>;
    error?: { message: string };
  };
  if (data.error) throw new Error(data.error.message);

  for (const p of data.candidates?.[0]?.content.parts ?? []) {
    if (p.inlineData?.data) {
      await fs.writeFile(outPath, Buffer.from(p.inlineData.data, "base64"));
      return;
    }
  }
  throw new Error("Gemini returned no inlineData");
}

/**
 * Render every panel in `panels` in parallel. Failures degrade gracefully —
 * the returned array only contains successfully-rendered paths. Caller decides
 * what to do if the count is too low to fill the video.
 */
export async function generateComicPanels(opts: GenerateOptions): Promise<string[]> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    log(ROLE, "warn", "GEMINI_API_KEY missing — skipping comic panels");
    return [];
  }
  if (!opts.panels.length) {
    log(ROLE, "warn", "no panels in posts — skipping comic panel generation");
    return [];
  }

  const outDir = path.join(SCENES_DIR, opts.filename);
  await fs.mkdir(outDir, { recursive: true });

  log(ROLE, "info", `Rendering ${opts.panels.length} comic panels in parallel...`);

  // Parallel is fine — Gemini handles concurrent requests, and serial would
  // turn 7 × ~10s renders into ~70s of latency on the cron's critical path.
  const tasks = opts.panels.map(async (panel, i) => {
    const outPath = path.join(outDir, `panel-${String(i + 1).padStart(2, "0")}.png`);
    try {
      await renderOne(panel, outPath, key);
      return outPath;
    } catch (e) {
      log(ROLE, "warn", `panel ${i + 1} failed: ${String(e).slice(0, 120)}`);
      return null;
    }
  });

  const results = await Promise.all(tasks);
  const successful = results.filter((p): p is string => p !== null);
  log(ROLE, "info", `${successful.length}/${opts.panels.length} panels rendered → ${outDir}`);
  return successful;
}
