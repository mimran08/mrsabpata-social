// One-off: backfill title/description on existing Shorts that uploaded with an
// empty description because of the old single-line-block bug in youtube-api.ts.
import * as path from "node:path";

function splitTitleAndDescription(text: string): { title: string; description: string } {
  const TITLE_MAX = 100, DESC_MAX = 5000;
  if (text.includes("\n")) {
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.length > 1) return { title: (lines[0] ?? "MrSabPata").slice(0, TITLE_MAX), description: lines.slice(1).join("\n").slice(0, DESC_MAX) };
  }
  const sentenceBreak = /[.!?]\s+/g;
  let firstBreakIdx = -1; let m: RegExpExecArray | null;
  while ((m = sentenceBreak.exec(text)) !== null) {
    if (m.index >= 20 && m.index <= TITLE_MAX) { firstBreakIdx = m.index + 1; break; }
  }
  if (firstBreakIdx > 0) return { title: text.slice(0, firstBreakIdx).trim().slice(0, TITLE_MAX), description: text.slice(firstBreakIdx).trim().slice(0, DESC_MAX) };
  if (text.length > TITLE_MAX) {
    const cut = text.slice(0, TITLE_MAX);
    const lastSpace = cut.lastIndexOf(" ");
    const splitAt = lastSpace > 40 ? lastSpace : TITLE_MAX;
    return { title: text.slice(0, splitAt).trim() + "…", description: text.slice(splitAt).trim().slice(0, DESC_MAX) };
  }
  return { title: (text.trim() || "MrSabPata").slice(0, TITLE_MAX), description: "Follow @MrSabPata for Sweden visa, jobs & life — link in bio." };
}

async function getToken(): Promise<string> {
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
  return (await res.json() as { access_token: string }).access_token;
}

async function updateVideo(token: string, id: string, title: string, description: string): Promise<void> {
  // videos.update needs the existing snippet category — fetch first
  const apiKey = process.env.YOUTUBE_API_KEY!;
  const getRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${id}&key=${apiKey}`);
  const getJson = await getRes.json() as { items: Array<{ snippet: { categoryId: string; tags?: string[]; defaultLanguage?: string } }> };
  if (!getJson.items?.length) throw new Error(`Video ${id} not found`);
  const existing = getJson.items[0].snippet;

  const updateRes = await fetch("https://www.googleapis.com/youtube/v3/videos?part=snippet", {
    method: "PUT",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      id,
      snippet: {
        title,
        description,
        categoryId: existing.categoryId,
        tags: existing.tags ?? ["Sweden", "immigration", "Pakistan", "MrSabPata"],
        defaultLanguage: existing.defaultLanguage ?? "ur",
      },
    }),
  });
  if (!updateRes.ok) throw new Error(`Update ${id} failed ${updateRes.status}: ${(await updateRes.text()).slice(0, 200)}`);
  console.log(`✅ ${id} updated — title (${title.length}): "${title.slice(0, 60)}..." desc (${description.length})`);
}

async function main() {
  const token = await getToken();

  // The 2 Shorts that uploaded with empty descriptions (from prior YT API check)
  const fixes: Array<{ id: string; rawText: string; note: string }> = [
    {
      id: "HD2gHi4dk5s",
      rawText: "Sweden Work Permit Update",  // from today's 6pm archive
      note: "today 6pm (Sweden Work Permit Update)",
    },
    {
      id: "S88f8uEBqTQ",
      rawText: "Europe Tightens Language Test Rules: What It Means For Immigrants. Ab immigrants ko zyada mehnat karni padegi, SFI courses lena zaroori ho sakta hai. #SwedenImmigration #LanguageTest #VisaRules",
      note: "2026-05-24 9am (Europe Language Tests)",
    },
  ];

  for (const f of fixes) {
    const { title, description } = splitTitleAndDescription(f.rawText);
    console.log(`\nPatching ${f.id} (${f.note})`);
    console.log(`  new title (${title.length}):`, JSON.stringify(title));
    console.log(`  new desc  (${description.length}):`, JSON.stringify(description.slice(0, 100)));
    await updateVideo(token, f.id, title, description);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
