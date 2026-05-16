import { fileMemo } from "../company/memos.js";
import { logAction } from "../utils/logger.js";
import { dateString } from "../utils/time.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";

const ROLE = "thumbnail_designer";

export interface ThumbnailBrief {
  videoTitle: string;
  expression: string;
  facePosition: "left" | "right";
  textOverlay: string;
  textEmotion: string;
  background: string;
  brandAccentPlacement: string;
  mobileReadable: boolean;
  visualPromise: string;
  titleHarmony: string;
  abTestConcept?: string;
}

export async function createThumbnailBrief(videoTitle: string, ctrWasLow = false): Promise<ThumbnailBrief> {
  logAction(ROLE, `Creating thumbnail brief: "${videoTitle}"`);

  const today = dateString();
  const slug = videoTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  const brief: ThumbnailBrief = {
    videoTitle,
    expression: "[Specific expression — e.g. 'the face you make when sharing something nobody else will say']",
    facePosition: "right",
    textOverlay: "[Max 4 words — large, mobile-readable]",
    textEmotion: "[What feeling the text creates in 1 second]",
    background: "Simple — one solid color or minimal blurred context",
    brandAccentPlacement: "Red #dc2626 — text outline or background stripe",
    mobileReadable: true,
    visualPromise: "[What viewer expects when they click]",
    titleHarmony: "[Thumbnail and title tell different parts of the same story]",
    abTestConcept: ctrWasLow ? "[Alternative concept for A/B test]" : undefined,
  };

  const briefFilename = `${today}-${slug}-brief.md`;
  const mockupFilename = `${today}-${slug}-mockup.html`;

  await fs.writeFile(
    path.join("company/thumbnails", briefFilename),
    formatBrief(brief),
    "utf-8",
  );

  await fs.writeFile(
    path.join("company/thumbnails", mockupFilename),
    generateMockupHtml(brief),
    "utf-8",
  );

  await fileMemo({
    from: ROLE,
    to: "ceo",
    date: today,
    subject: `Thumbnail ready: ${videoTitle}`,
    body: `Brief: company/thumbnails/${briefFilename}\nMockup: company/thumbnails/${mockupFilename}`,
    actionRequired: false,
  });

  logAction(ROLE, `Thumbnail brief + mockup filed`);
  return brief;
}

function formatBrief(b: ThumbnailBrief): string {
  return `# Thumbnail Brief: ${b.videoTitle}

| Field | Value |
|---|---|
| Expression | ${b.expression} |
| Face Position | ${b.facePosition} |
| Text Overlay | ${b.textOverlay} |
| Text Emotion | ${b.textEmotion} |
| Background | ${b.background} |
| Brand Accent | ${b.brandAccentPlacement} |
| Mobile Readable at 100px | ${b.mobileReadable ? "Yes" : "No — fix required"} |
| Visual Promise | ${b.visualPromise} |
| Title Harmony | ${b.titleHarmony} |
${b.abTestConcept ? `| A/B Test Concept | ${b.abTestConcept} |` : ""}

## Rules (non-negotiable)
- Imran's face takes up 60%+ of frame
- Text max 4 words, large enough at 100px (68.9% mobile audience)
- BANNED: clocks, red stamps, yellow urgent text, multiple text blocks
- Red #dc2626 as brand accent only
`;
}

function generateMockupHtml(b: ThumbnailBrief): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Thumbnail Mockup: ${b.videoTitle}</title>
  <style>
    body { margin: 0; background: #111; display: flex; align-items: center; justify-content: center; min-height: 100vh; font-family: sans-serif; }
    .thumb { position: relative; width: 1280px; height: 720px; background: #1a1a1a; border-radius: 8px; overflow: hidden; }
    .face-area { position: absolute; ${b.facePosition === "right" ? "right: 0;" : "left: 0;"} top: 0; width: 60%; height: 100%; background: #333; display: flex; align-items: center; justify-content: center; color: #888; font-size: 24px; }
    .text-area { position: absolute; ${b.facePosition === "right" ? "left: 0;" : "right: 0;"} top: 50%; transform: translateY(-50%); width: 40%; padding: 40px; }
    .overlay-text { font-size: 96px; font-weight: 900; color: #fff; line-height: 1; text-transform: uppercase; }
    .accent { color: #dc2626; }
    .meta { color: #666; font-size: 14px; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="thumb">
    <div class="face-area">[Imran's face — ${b.expression}]</div>
    <div class="text-area">
      <div class="overlay-text"><span class="accent">${b.textOverlay || "YOUR TEXT"}</span></div>
      <div class="meta">${b.videoTitle}</div>
    </div>
  </div>
</body>
</html>`;
}
