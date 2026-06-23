// Delete every YouTube video whose title contains Ahmed/Fatima/Bilal OR
// starts with "Title:" (raw template leak). Per the 2026-06-23 pivot
// (docs/COMPANY-PROMPT.md PART 1+7), the AI cast experiment is retired
// and Imran's audit explicitly says "Priority 1: Kill all Ahmed content".
//
// Uses the existing YT OAuth (youtube scope covers videos.delete).
// IRREVERSIBLE — confirm before running. Founder already confirmed via
// AskUserQuestion on 2026-06-23.

import { log } from "../utils/logger.js";

const AHMED_REGEX = /\b(ahmed|fatima|bilal)\b/i;
const TEMPLATE_REGEX = /^Title:/i;

async function getAccessToken(): Promise<string> {
  const id = process.env.YOUTUBE_CLIENT_ID;
  const secret = process.env.YOUTUBE_CLIENT_SECRET;
  const rt = process.env.YOUTUBE_REFRESH_TOKEN;
  if (!id || !secret || !rt) throw new Error("Missing YOUTUBE_CLIENT_ID / SECRET / REFRESH_TOKEN");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: id, client_secret: secret, refresh_token: rt, grant_type: "refresh_token" }),
  });
  const tok = await r.json() as { access_token?: string; error?: string };
  if (!tok.access_token) throw new Error(`token failed: ${JSON.stringify(tok)}`);
  return tok.access_token;
}

async function listOffendingVideos(): Promise<Array<{ id: string; title: string; views: number }>> {
  const apiKey = process.env.YOUTUBE_API_KEY!;
  const channelId = process.env.YOUTUBE_CHANNEL_ID!;
  const offending: Array<{ id: string; title: string; views: number }> = [];
  let pageToken = "";
  do {
    const url = `https://www.googleapis.com/youtube/v3/search?part=id&channelId=${channelId}&maxResults=50&order=date&type=video&key=${apiKey}${pageToken ? `&pageToken=${pageToken}` : ""}`;
    const s = await fetch(url).then(r => r.json()) as { items?: Array<{ id: { videoId: string } }>; nextPageToken?: string };
    const ids = (s.items ?? []).map(i => i.id.videoId);
    if (ids.length) {
      const v = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${ids.join(",")}&key=${apiKey}`).then(r => r.json()) as { items?: Array<{ id: string; snippet: { title: string }; statistics: { viewCount?: string } }> };
      for (const it of v.items ?? []) {
        const title = it.snippet.title;
        if (AHMED_REGEX.test(title) || TEMPLATE_REGEX.test(title)) {
          offending.push({ id: it.id, title, views: Number(it.statistics.viewCount ?? 0) });
        }
      }
    }
    pageToken = s.nextPageToken ?? "";
  } while (pageToken);
  return offending;
}

async function deleteVideo(videoId: string, accessToken: string): Promise<void> {
  const r = await fetch(`https://www.googleapis.com/youtube/v3/videos?id=${videoId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (r.status !== 204) {
    const body = await r.text();
    throw new Error(`delete ${videoId} failed ${r.status}: ${body.slice(0, 200)}`);
  }
}

async function main() {
  const ROLE = "DeleteAhmed";
  log(ROLE, "info", "Scanning channel for Ahmed/Fatima/Bilal/template-leak titles...");
  const list = await listOffendingVideos();
  log(ROLE, "info", `Found ${list.length} videos to delete`);
  for (const v of list) {
    log(ROLE, "info", `  • ${v.id}  views=${v.views}  '${v.title.slice(0, 80)}'`);
  }
  if (list.length === 0) {
    log(ROLE, "info", "Nothing to delete.");
    return;
  }

  const accessToken = await getAccessToken();
  log(ROLE, "info", "OAuth token acquired — starting deletes");

  let ok = 0, fail = 0;
  for (const v of list) {
    try {
      await deleteVideo(v.id, accessToken);
      log(ROLE, "info", `  ✓ deleted ${v.id}`);
      ok++;
    } catch (e) {
      log(ROLE, "warn", `  ✗ ${v.id}: ${String(e).slice(0, 200)}`);
      fail++;
    }
    // Rate limit safety
    await new Promise(r => setTimeout(r, 600));
  }
  log(ROLE, "info", `Done. Deleted ${ok}/${list.length} (${fail} failed)`);
}

main().catch(e => { console.error(String(e).slice(0, 400)); process.exit(1); });
