import * as fs from "node:fs/promises";
import { log } from "../utils/logger.js";

const ROLE = "YouTube-API";

// Split a YouTube text block into a short title (≤100 chars, YouTube hard limit)
// and a description. Post-bank entries are pre-formatted with a title line + body
// lines separated by `\n` — use newlines as the boundary in that case.
//
// Groq news outputs are usually a single run-on block: "Sentence one. Sentence
// two with hashtags." → without this helper, the entire block became the
// (truncated) title and the description was empty. Now: when there are no line
// breaks, split on the first sentence boundary (`. `, `! `, `? `) found at a
// reasonable position so the first sentence becomes the title and the rest
// becomes the description.
function splitTitleAndDescription(text: string): { title: string; description: string } {
  const TITLE_MAX = 100;
  const DESC_MAX = 5000;

  // Prefer explicit line breaks if present (post-bank style)
  if (text.includes("\n")) {
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.length > 1) {
      return {
        title: (lines[0] ?? "MrSabPata").slice(0, TITLE_MAX),
        description: lines.slice(1).join("\n").slice(0, DESC_MAX),
      };
    }
  }

  // Single-block path: split on first sentence boundary at position ≥ 20
  const sentenceBreak = /[.!?]\s+/g;
  let firstBreakIdx = -1;
  let m: RegExpExecArray | null;
  while ((m = sentenceBreak.exec(text)) !== null) {
    if (m.index >= 20 && m.index <= TITLE_MAX) {
      firstBreakIdx = m.index + 1;  // include the punctuation in the title
      break;
    }
  }

  if (firstBreakIdx > 0) {
    return {
      title: text.slice(0, firstBreakIdx).trim().slice(0, TITLE_MAX),
      description: text.slice(firstBreakIdx).trim().slice(0, DESC_MAX),
    };
  }

  // No sentence break — split at word boundary near TITLE_MAX
  if (text.length > TITLE_MAX) {
    const cut = text.slice(0, TITLE_MAX);
    const lastSpace = cut.lastIndexOf(" ");
    const splitAt = lastSpace > 40 ? lastSpace : TITLE_MAX;
    return {
      title: text.slice(0, splitAt).trim() + "…",
      description: text.slice(splitAt).trim().slice(0, DESC_MAX),
    };
  }

  // Title-only (genuinely short text). Description fallback so the upload
  // doesn't show a totally blank description field.
  return {
    title: (text.trim() || "MrSabPata").slice(0, TITLE_MAX),
    description: "Follow @MrSabPata for Sweden visa, jobs & life — link in bio.",
  };
}

async function getAccessToken(): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: process.env.YOUTUBE_CLIENT_ID!,
      client_secret: process.env.YOUTUBE_CLIENT_SECRET!,
      refresh_token: process.env.YOUTUBE_REFRESH_TOKEN!,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OAuth token refresh failed ${res.status}: ${err.slice(0, 200)}`);
  }
  const data = await res.json() as { access_token: string };
  return data.access_token;
}

// Uploads a local MP4 as a YouTube Short (1080×1920 auto-detected by YouTube)
export async function uploadYouTubeShort(text: string, videoPath: string): Promise<string> {
  const missingKeys = ["YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET", "YOUTUBE_REFRESH_TOKEN"]
    .filter(k => !process.env[k]);
  if (missingKeys.length) {
    throw new Error(`Missing env vars: ${missingKeys.join(", ")} — run scripts/setup-youtube-oauth.ts`);
  }

  const { title, description } = splitTitleAndDescription(text);

  const accessToken = await getAccessToken();
  log(ROLE, "info", "Access token obtained");

  const videoBytes = await fs.readFile(videoPath);
  const fileSize = videoBytes.byteLength;

  // Step 1: Initiate resumable upload session
  const initRes = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Upload-Content-Type": "video/mp4",
        "X-Upload-Content-Length": String(fileSize),
      },
      body: JSON.stringify({
        snippet: {
          title,
          description,
          categoryId: "22", // People & Blogs
          tags: ["Sweden", "immigration", "Pakistan", "MrSabPata"],
          defaultLanguage: "ur",
        },
        status: {
          privacyStatus: "public",
          selfDeclaredMadeForKids: false,
        },
      }),
    }
  );

  if (!initRes.ok) {
    const err = await initRes.text();
    throw new Error(`Upload init failed ${initRes.status}: ${err.slice(0, 300)}`);
  }

  const uploadUrl = initRes.headers.get("Location");
  if (!uploadUrl) throw new Error("No upload URL in response");
  log(ROLE, "info", `Upload session initiated — uploading ${(fileSize / 1024 / 1024).toFixed(1)}MB`);

  // Step 2: Upload the video bytes
  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(fileSize),
    },
    body: videoBytes,
  });

  if (!uploadRes.ok && uploadRes.status !== 201) {
    const err = await uploadRes.text();
    throw new Error(`Video upload failed ${uploadRes.status}: ${err.slice(0, 300)}`);
  }

  const result = await uploadRes.json() as { id: string };
  const videoId = result.id;
  log(ROLE, "info", `Uploaded to YouTube: https://youtube.com/shorts/${videoId}`);
  return videoId;
}
