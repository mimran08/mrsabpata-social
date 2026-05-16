import * as fs from "node:fs/promises";
import { log } from "../utils/logger.js";

const ROLE = "YouTube-API";

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

  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const title = (lines[0] ?? "MrSabPata").slice(0, 100);
  const description = lines.slice(1).join("\n").slice(0, 5000);

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
