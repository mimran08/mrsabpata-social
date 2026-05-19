import { postTweet } from "../platforms/x.js";
import { postViaBrowser } from "../platforms/x-browser.js";
import { postViaTikTok } from "../platforms/tiktok-browser.js";
import { uploadYouTubeShort as uploadYouTubeShortAPI } from "../platforms/youtube-api.js";
import { uploadYouTubeShort as uploadYouTubeShortBrowser } from "../platforms/youtube-browser.js";
import { postViaInstagram } from "../platforms/instagram-browser.js";
import { generatePostImage } from "../utils/image-gen.js";
import { generateAnimatedVideo } from "../utils/video-gen-animated.js";
import { generateVideo } from "../utils/video-gen.js";
import { fetchRelevantNews } from "../utils/news-fetcher.js";
import { log } from "../utils/logger.js";
import { dateString } from "../utils/time.js";
import { readBrain } from "../company/brain.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";

const ROLE = "DailyPoster";

// ─── Channel context ────────────────────────────────────────────────────────────

const CHANNEL = {
  name: "MrSabPata",
  niche: "Pakistani immigrant in Sweden — Sweden immigration, jobs, and real life for Pakistani audience",
  audience: "Pakistanis thinking about Sweden or already there",
  tone: "Natural Karachi Urdu mixed with English. Dost jaisi baat. No corporate speak. No greetings.",
  codeswitch: "Use: basically, honestly, actually, seriously, okay so, I mean. Keep English: skills, visa, work permit, deadline, documents, process, platform, profile, timeline.",
  pillars: {
    "1": "Sweden Visa & Immigration",
    "2": "Jobs & Career in Sweden",
    "3": "Real Immigrant Stories",
    "4": "Personal / Faith / Life",
  },
};

const UPCOMING_VIDEOS = [
  { title: "Sweden Citizenship Rules 2026 — 8 Saal Ka Intezaar Ab Zaroor Hai", pillar: "1", publishDate: "13 May 2026", hook: "Sweden citizenship is now 8 years. Swedish language test and civics test are now mandatory. Effective 6 June 2026." },
  { title: "Sweden Work Permit June 2026 — Naya Salary Rule", pillar: "1", publishDate: "15 May 2026", hook: "New minimum salary for Sweden work permit: SEK 33,390 from June 1 2026. Up from SEK 29,680 — a 13% jump." },
  { title: "Sweden Mein IT Job Bina Degree Ke", pillar: "2", publishDate: "19 May 2026", hook: "IT job in Sweden without a degree is possible but takes 12-18 months seriously. Portfolio is non-negotiable." },
  { title: "Stockholm Mein Ghar Dhundhna — 10 Saal Ki Queue Ka Brutal Sach", pillar: "3", publishDate: "22 May 2026", hook: "Stockholm rental queue is 10+ years. Andrahand contracts are reality for first 2-3 years." },
  { title: "Sweden Citizenship Test 2026 — Yeh Sawal Aa Sakte Hain", pillar: "1", publishDate: "26 May 2026", hook: "Sweden citizenship test launches August 2026. Expect: democratic values, government structure, gender equality, Swedish history." },
  { title: "Sweden Job Interview Formula", pillar: "2", publishDate: "28 May 2026", hook: "Swedish interviews are competency-based. They want 'I' not 'we'. Saying sir/madam is a red flag." },
  { title: "Pakistan Se Sweden — Pehle 90 Din Ki Sachchi Kahani", pillar: "3", publishDate: "2 June 2026", hook: "First 90 days: excitement, then frustration, then loneliness weeks 5-8. It passes. You're not alone." },
  { title: "Ramadan Sweden Mein — Jab Roza 19 Ghante Ka Ho", pillar: "4", publishDate: "4 June 2026", hook: "Summer Ramadan in Sweden: 19-20 hour fast. Winter Ramadan: Maghrib at 3pm. Both taught something unexpected." },
];

const CURRENT_FACTS = [
  "Sweden citizenship now requires 8 years (up from 5) — effective 6 June 2026",
  "Sweden work permit minimum salary: SEK 33,390/month from June 1 2026 (was SEK 29,680)",
  "Swedish citizenship test launching August 2026 — exact format TBD",
  "152 shortage occupations in Sweden with faster work permit processing",
  "SFI (Swedish for Immigrants) is free — and now directly linked to citizenship",
  "Stockholm rental queue: 10+ years for hyresrätt. Andrahand contracts are the realistic option",
  "Average Stockholm rent: SEK 9,200/month — up 6.8% from last year",
  "Sweden overall unemployment 9.7% (March 2026) but IT unemployment under 5%",
  "AI/ML engineers highest demand in Sweden: SEK 65k-80k/month",
  "Cybersecurity specialists: critical shortage in Sweden, SEK 55k-70k/month",
  "Personnummer takes 4-6 weeks — use Wise or Revolut in the meantime",
  "Swedish elections September 2026 — immigration policy is central issue",
  "40,000+ Pakistanis in Sweden — NordPak Foundation and community groups are key resources",
  "Islamiska Förbundet fatwa: 19-hour fast not mandatory if health doesn't allow",
  "Swedish Discrimination Act protects faith-based accommodations at work",
  "Komvux provides free IT courses for Swedish residents — Python, web dev, data analysis",
  "Yrkeshögskola: 2-year vocational IT programs — employers specifically value these",
];

// ─── Famous motivational quotes ───────────────────────────────────────────────

const FAMOUS_QUOTES = [
  // Rumi
  { text: "The wound is the place where the Light enters you.", author: "Rumi" },
  { text: "Out beyond ideas of wrongdoing and rightdoing, there is a field. I'll meet you there.", author: "Rumi" },
  { text: "Yesterday I was clever, so I wanted to change the world. Today I am wise, so I am changing myself.", author: "Rumi" },
  { text: "Don't be satisfied with stories, how things have gone with others. Unfold your own myth.", author: "Rumi" },
  { text: "When you do things from your soul, you feel a river moving in you, a joy.", author: "Rumi" },
  { text: "The quieter you become, the more you are able to hear.", author: "Rumi" },
  // Allama Iqbal
  { text: "Khudi ko kar buland itna ke har taqdeer se pehle, Khuda bande se khud puche bata teri raza kya hai.", author: "Allama Iqbal" },
  { text: "Tu shaheen hai, parwaz hai kaam tera. Tere saamne aasman aur bhi hain.", author: "Allama Iqbal" },
  { text: "Sitaron se aage jahan aur bhi hain. Abhi ishq ke imtihan aur bhi hain.", author: "Allama Iqbal" },
  { text: "Apne mann mein doob kar paa ja suragh-e-zindagi. Tu agar mera nahi banta na ban, apna to ban.", author: "Allama Iqbal" },
  // Prophet Muhammad ﷺ
  { text: "The strong person is not the one who can overpower others. The strong person is the one who controls himself when he is angry.", author: "Prophet Muhammad ﷺ" },
  { text: "Seek knowledge from the cradle to the grave.", author: "Prophet Muhammad ﷺ" },
  { text: "Tie your camel, then put your trust in Allah.", author: "Prophet Muhammad ﷺ" },
  // Albert Einstein (immigrant himself)
  { text: "In the middle of difficulty lies opportunity.", author: "Albert Einstein" },
  { text: "A person who never made a mistake never tried anything new.", author: "Albert Einstein" },
  { text: "Life is like riding a bicycle. To keep your balance, you must keep moving.", author: "Albert Einstein" },
  { text: "Imagination is more important than knowledge.", author: "Albert Einstein" },
  // Nelson Mandela
  { text: "It always seems impossible until it's done.", author: "Nelson Mandela" },
  { text: "The greatest glory in living lies not in never falling, but in rising every time we fall.", author: "Nelson Mandela" },
  { text: "Education is the most powerful weapon you can use to change the world.", author: "Nelson Mandela" },
  // Maya Angelou
  { text: "You may encounter many defeats, but you must not be defeated.", author: "Maya Angelou" },
  { text: "We may encounter many defeats but we must not be defeated.", author: "Maya Angelou" },
  { text: "Nothing will work unless you do.", author: "Maya Angelou" },
  // Khalil Gibran
  { text: "Your pain is the breaking of the shell that encloses your understanding.", author: "Khalil Gibran" },
  { text: "Out of suffering have emerged the strongest souls.", author: "Khalil Gibran" },
  // Martin Luther King Jr.
  { text: "If you can't fly then run, if you can't run then walk, if you can't walk then crawl, but whatever you do you have to keep moving forward.", author: "Martin Luther King Jr." },
  { text: "The time is always right to do what is right.", author: "Martin Luther King Jr." },
  // Winston Churchill
  { text: "Success is not final, failure is not fatal: it is the courage to continue that counts.", author: "Winston Churchill" },
  { text: "If you're going through hell, keep going.", author: "Winston Churchill" },
  // Confucius
  { text: "It does not matter how slowly you go as long as you do not stop.", author: "Confucius" },
  { text: "Our greatest glory is not in never falling, but in rising every time we fall.", author: "Confucius" },
  // Steve Jobs
  { text: "The people who are crazy enough to think they can change the world are the ones who do.", author: "Steve Jobs" },
  { text: "Your work is going to fill a large part of your life, and the only way to be truly satisfied is to do what you believe is great work.", author: "Steve Jobs" },
  // Oprah Winfrey
  { text: "The biggest adventure you can take is to live the life of your dreams.", author: "Oprah Winfrey" },
  { text: "Turn your wounds into wisdom.", author: "Oprah Winfrey" },
];

// ─── Per-day cache — enables retry without regenerating content or double-posting

interface DayCache {
  posts: { x: string; instagram: string; tiktok: string; youtube: string; stat: string; subtext: string; pillar: string; theme: string };
  source: "groq" | "bank";
  imagePath?: string;
  bgImagePath?: string;
  videoPath?: string;
  done: { x: boolean; tiktok: boolean; instagram: boolean; youtube: boolean };
}

// ─── Groq free API ─────────────────────────────────────────────────────────────

async function generateViaGroq(session: "morning" | "evening"): Promise<{
  x: string; instagram: string; tiktok: string; youtube: string; stat: string; subtext: string; pillar: string; theme: string;
}> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY not set");

  const pillarKey = session === "morning"
    ? (Math.random() < 0.6 ? "1" : "2")
    : (Math.random() < 0.5 ? "3" : "4");

  const pillarName = CHANNEL.pillars[pillarKey as keyof typeof CHANNEL.pillars];

  const pillarFacts = CURRENT_FACTS.filter((_, i) => {
    if (pillarKey === "1") return i <= 5;
    if (pillarKey === "2") return i >= 6 && i <= 11;
    if (pillarKey === "3") return i >= 10 && i <= 13;
    return i >= 13;
  });
  const fact = pillarFacts[Math.floor(Math.random() * pillarFacts.length)] ?? CURRENT_FACTS[0];

  const today = new Date();
  const nextVideo = UPCOMING_VIDEOS.find(v => {
    const parts = v.publishDate.split(" ");
    const vDate = new Date(`${parts[1]} ${parts[0].replace(/\D/g, "")} ${parts[2] ?? 2026}`);
    return vDate >= today && v.pillar === pillarKey;
  }) ?? UPCOMING_VIDEOS.find(v => v.pillar === pillarKey);

  const crossPromo = nextVideo
    ? `\n\nUpcoming video to reference if natural: "${nextVideo.title}" (${nextVideo.publishDate}) — Key info: ${nextVideo.hook}`
    : "";

  const prompt = `You are MrSabPata — writing social media posts to help Pakistanis navigate Swedish immigration, jobs, and life. Posts are news and information — specific facts, numbers, steps, deadlines. No personal stories, no anecdotes, no first-person narratives.

Topic for this post: "${fact}"${crossPromo}

━━━ VOICE ━━━
Natural Karachi Urdu + English mix.
Keep English for: visa, work permit, personnummer, SFI, LinkedIn, salary, deadline, portfolio, IT, citizenship, interview, recruiter.
Everything else in conversational Urdu.

BANNED — never write like this:
❌ Personal stories: "Ek baar main ne...", "Ek raat...", "Main ne feel kiya..."
❌ Anecdotes about other people: "Ek Pakistani developer ne mujhe bataya..."
❌ Filler sentence starters: "Seriously,", "Honestly,", "Basically,", "I mean,", "Okay so,"
❌ Emotional narrative framing

━━━ INSTAGRAM (most important) ━━━
Write practical, informational content with specific facts. 6-10 sentences.

Structure:
• Line 1: Direct statement of the key fact, number, or rule — the hook
• Lines 2-5: Specific details — exact numbers, steps, official sources, timelines, requirements
• Lines 6-7: What action to take with this information
• Last line: A specific question to the reader
• End with 6-8 relevant hashtags on a new line

Good example:
"Sweden work permit minimum salary 1 June 2026 se SEK 33,390 hai — pehle SEK 29,680 thi. Yeh 13% increase hai.

Agar job offer is se kam hai — yeh steps follow karo:
1. Job offer letter mein exact monthly figure confirm karo
2. Employer ko email karo: 'I've reviewed the new Swedish work permit requirements effective June 1 2026. Can the salary be adjusted to SEK 33,390?'
3. Shortage occupation list check karo — 152 professions mein different thresholds apply hoti hain

Official source: Migrationsverket.se par work permit section.
Shortage list: Migrationsverket.se par 'brist yrken list 2026' search karo.

Kya aap Sweden work permit apply kar rahe hain? Comment mein batao.

#SwedenWorkPermit #SwedenVisa #PakistaniInSweden #SwedenImmigration #SwedenJobs #MrSabPata"

━━━ OTHER FORMATS ━━━
X post: MAX 260 chars. Key fact + what to do. End with 1 hashtag. No filler words.
TikTok: One key fact as hook + 2-3 bullet points. Max 150 chars total. 3 hashtags.
YouTube: Title on line 1 (max 80 chars, topic-first). 2-3 informational sentences. 3-5 hashtags.
stat: The biggest number or fact as image headline. Max 6 words, English only.
subtext: One English line with supporting context. Max 8 words.

Return ONLY valid JSON, no markdown:
{"x":"...","instagram":"...","tiktok":"...","youtube":"...","stat":"...","subtext":"...","theme":"one line topic description"}`;

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1200,
      temperature: 0.8,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq API error ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json() as { choices: Array<{ message: { content: string } }> };
  const rawText = data.choices[0].message.content.trim();

  const stripped = rawText.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object in Groq response");
  const raw = JSON.parse(stripped.slice(start, end + 1)) as Record<string, unknown>;
  const stringify = (v: unknown): string =>
    typeof v === "string" ? v : typeof v === "object" && v !== null ? Object.values(v).join("\n") : String(v ?? "");
  const posts = {
    x: stringify(raw.x),
    instagram: stringify(raw.instagram),
    tiktok: stringify(raw.tiktok),
    youtube: stringify(raw.youtube),
    stat: stringify(raw.stat),
    subtext: stringify(raw.subtext),
    theme: stringify(raw.theme),
  };

  return { ...posts, pillar: pillarKey };
}

// ─── Quote-driven generation ───────────────────────────────────────────────────

async function generateFromQuote(session: "morning" | "evening"): Promise<{
  x: string; instagram: string; tiktok: string; youtube: string; stat: string; subtext: string; pillar: string; theme: string;
} | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  const quote = FAMOUS_QUOTES[Math.floor(Math.random() * FAMOUS_QUOTES.length)];
  log(ROLE, "info", `Quote: "${quote.text.slice(0, 60)}..." — ${quote.author}`);

  const prompt = `You are MrSabPata — writing for Pakistanis and South Asians who are living in Sweden or seriously considering moving there. Real people dealing with visa stress, job hunts, housing queues, loneliness, and building a new life far from home.

━━━ TODAY'S QUOTE ━━━
"${quote.text}"
— ${quote.author}

━━━ YOUR JOB ━━━
Write social media posts that connect this quote to the real immigrant/newcomer experience in Sweden.
Make it personal and grounded — not generic motivation. How does this quote speak to someone waiting months for their permit, struggling to get their first Swedish job, sitting alone in a new city?

━━━ VOICE ━━━
Natural Karachi Urdu + English mix. Warm, like a friend who understands the struggle.
Keep English for: visa, work permit, personnummer, SFI, citizenship, Migrationsverket, salary.

BANNED:
❌ Personal stories ("Ek baar main ne...")
❌ "Seriously,", "Honestly,", "Basically," as openers
❌ Generic "believe in yourself" empty motivation
❌ Made-up facts

━━━ FORMATS ━━━
Instagram: 6-8 sentences. Line 1 = the quote itself in Urdu/English mix. Lines 2-5 = what it means for someone building life in Sweden. End with a relatable question. 6-8 hashtags.
X: MAX 260 chars. Quote snippet + what it means for immigrants. 1 hashtag.
TikTok: Quote hook + 2-3 connection points. Max 150 chars. 3 hashtags.
YouTube: Title line with author name. 2-3 sentences connecting to immigrant journey. 3-5 hashtags.
stat: The quote shortened to max 7 words — most powerful part.
subtext: "— ${quote.author}" attribution line.
theme: One line topic description.
pillar: "1" (visa/immigration), "2" (jobs), "3" (life/housing), "4" (faith/mindset)

Return ONLY valid JSON, no markdown:
{"x":"...","instagram":"...","tiktok":"...","youtube":"...","stat":"...","subtext":"...","theme":"...","pillar":"4"}`;

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1400,
      temperature: 0.75,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) return null;

  const data = await res.json() as { choices: Array<{ message: { content: string } }> };
  const rawText = data.choices[0].message.content.trim();
  const stripped = rawText.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
  const start = stripped.indexOf("{"), end = stripped.lastIndexOf("}");
  if (start === -1 || end === -1) return null;

  const raw = JSON.parse(stripped.slice(start, end + 1)) as Record<string, unknown>;
  const str = (v: unknown): string =>
    typeof v === "string" ? v : typeof v === "object" && v !== null ? Object.values(v).join("\n") : String(v ?? "");

  return {
    x: str(raw.x), instagram: str(raw.instagram), tiktok: str(raw.tiktok),
    youtube: str(raw.youtube), stat: str(raw.stat) || quote.text.slice(0, 40),
    subtext: str(raw.subtext) || `— ${quote.author}`,
    theme: str(raw.theme), pillar: str(raw.pillar) || "4",
  };
}

// ─── News-driven generation (TheLocal.se + other sources → Groq) ──────────────

async function generateFromNews(session: "morning" | "evening"): Promise<{
  x: string; instagram: string; tiktok: string; youtube: string; stat: string; subtext: string; pillar: string; theme: string;
} | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  const articles = await fetchRelevantNews(5);
  if (!articles.length) return null;

  // Pick article: alternate between top-scored and second for variety
  const pick = articles[Math.floor(Math.random() * Math.min(3, articles.length))];
  log(ROLE, "info", `News: "${pick.title.slice(0, 70)}" (score ${pick.relevanceScore})`);

  const prompt = `You are MrSabPata — writing social media posts for Pakistanis and South Asians living in or moving to Sweden. Your audience are real people: newcomers, visa applicants, workers, students, families.

━━━ TODAY'S NEWS ━━━
Title: ${pick.title}
Source: ${pick.url}
Summary: ${pick.summary}

━━━ YOUR JOB ━━━
Write posts based ONLY on this news story. Explain what it means for immigrants and newcomers in Sweden. Add practical context they need — what to do, what it changes, what to watch out for.

━━━ VOICE ━━━
Natural Karachi Urdu + English mix. Keep English for: visa, permit, personnummer, SFI, salary, citizenship, Migrationsverket, deadline, court, law.
Everything else in conversational Urdu.

BANNED — never write:
❌ "Ek baar main ne...", "Ek raat...", personal stories
❌ "Seriously,", "Honestly,", "Basically," — filler starters
❌ Made-up numbers or facts not in the source

━━━ FORMATS ━━━
Instagram (most important): 6-10 sentences. Line 1 = the key news fact as a hook. Lines 2-5 = what it means, what changes, practical steps. Last line = question to reader. End with 6-8 hashtags.
X: MAX 260 chars. Key fact + what it means for immigrants. 1 hashtag.
TikTok: Hook fact + 2-3 bullet points. Max 150 chars. 3 hashtags.
YouTube: Title line 1 (max 80 chars). 2-3 informational sentences. 3-5 hashtags.
stat: The biggest fact/number as image headline. Max 6 words, English only.
subtext: One English supporting line. Max 8 words.
theme: One line topic description.
pillar: Use "1" (visa/immigration), "2" (jobs/work), "3" (housing/life), or "4" (faith/community)

Return ONLY valid JSON, no markdown:
{"x":"...","instagram":"...","tiktok":"...","youtube":"...","stat":"...","subtext":"...","theme":"...","pillar":"1"}`;

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1400,
      temperature: 0.7,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) return null;

  const data = await res.json() as { choices: Array<{ message: { content: string } }> };
  const rawText = data.choices[0].message.content.trim();
  const stripped = rawText.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
  const start = stripped.indexOf("{"), end = stripped.lastIndexOf("}");
  if (start === -1 || end === -1) return null;

  const raw = JSON.parse(stripped.slice(start, end + 1)) as Record<string, unknown>;
  const str = (v: unknown): string =>
    typeof v === "string" ? v : typeof v === "object" && v !== null ? Object.values(v).join("\n") : String(v ?? "");

  return {
    x: str(raw.x), instagram: str(raw.instagram), tiktok: str(raw.tiktok),
    youtube: str(raw.youtube), stat: str(raw.stat), subtext: str(raw.subtext),
    theme: str(raw.theme), pillar: str(raw.pillar) || "1",
  };
}

// ─── Post bank ─────────────────────────────────────────────────────────────────

async function getFromPostBank(session: "morning" | "evening"): Promise<{
  x: string; instagram: string; tiktok: string; youtube: string; stat: string; subtext: string; pillar: string; theme: string;
}> {
  const bankPath = path.join("company", "post-bank.json");
  const raw = await fs.readFile(bankPath, "utf-8");
  const bank = JSON.parse(raw) as {
    last_index: Record<string, number>;
    morning: Array<{ pillar: string; theme: string; x: string; instagram: string; tiktok: string; youtube: string; stat?: string; subtext?: string }>;
    evening: Array<{ pillar: string; theme: string; x: string; instagram: string; tiktok: string; youtube: string; stat?: string; subtext?: string }>;
  };

  const list = bank[session];
  // Date-based deterministic rotation — CI runs are stateless (workspace writes don't
  // persist), so an incrementing counter would always start from the same git-tracked
  // value and pick the same theme every day. Days-since-epoch % list.length cycles
  // through every entry over `list.length` days without any persisted state.
  const EPOCH = new Date("2026-01-01").getTime();
  const dayIndex = Math.floor((Date.now() - EPOCH) / (24 * 60 * 60 * 1000));
  // Offset evening by half the list so morning/evening pick from different halves
  const sessionOffset = session === "evening" ? Math.floor(list.length / 2) : 0;
  const idx = ((dayIndex + sessionOffset) % list.length + list.length) % list.length;
  const post = list[idx];

  return {
    ...post,
    stat: post.stat ?? post.theme,
    subtext: post.subtext ?? "",
  };
}

// ─── Archive post ──────────────────────────────────────────────────────────────

async function archivePost(session: "morning" | "evening", posts: {
  x: string; instagram: string; tiktok: string; youtube: string; stat: string; subtext: string; pillar: string; theme: string;
}, source: "groq" | "bank"): Promise<string> {
  const dir = path.join("company", "daily-posts");
  await fs.mkdir(dir, { recursive: true });

  const filename = `${dateString()}-${session}.md`;
  const filepath = path.join(dir, filename);

  const pillarName = CHANNEL.pillars[posts.pillar as keyof typeof CHANNEL.pillars] ?? posts.pillar;

  const content = `# ${session === "morning" ? "Morning (9am)" : "Evening (6pm)"} Post — ${dateString()}

**Source:** ${source === "groq" ? "AI-generated (Groq Llama 3.3)" : "Post bank (rotate)"}
**Pillar:** ${posts.pillar} — ${pillarName}
**Theme:** ${posts.theme}

---

## X / Twitter

${posts.x}

---

## Instagram

${posts.instagram}

---

## TikTok

${posts.tiktok}

---

## YouTube Shorts

${posts.youtube}

---

*Generated ${new Date().toISOString()}*
`;

  await fs.writeFile(filepath, content, "utf-8");
  return filepath;
}

// ─── Main export ───────────────────────────────────────────────────────────────

export async function postDailyContent(session: "morning" | "evening"): Promise<void> {
  const timeStr = new Date().toLocaleTimeString("en-GB", { timeZone: "Europe/Stockholm", hour: "2-digit", minute: "2-digit" });
  log(ROLE, "info", `${session === "morning" ? "Morning" : "Evening"} post — ${timeStr} Stockholm`);

  // ── Cache: enables retry without regenerating content or double-posting ───────
  const cacheFile = path.join("company", "daily-posts", `${dateString()}-${session}-cache.json`);
  let cache: DayCache | null = null;
  try {
    cache = JSON.parse(await fs.readFile(cacheFile, "utf-8")) as DayCache;
    log(ROLE, "info", `Retry run — cache loaded. Done: X=${cache.done.x} TikTok=${cache.done.tiktok} IG=${cache.done.instagram} YT=${cache.done.youtube}`);
  } catch { /* first run of the day — no cache yet */ }

  // Helper: save done flags back to cache file after each platform success
  const saveDone = async (done: DayCache["done"]) => {
    try {
      const current: DayCache = cache ?? { posts: posts!, source: source!, done };
      current.done = done;
      if (imagePath)   current.imagePath   = imagePath;
      if (bgImagePath) current.bgImagePath = bgImagePath;
      if (videoPath)   current.videoPath   = videoPath;
      await fs.writeFile(cacheFile, JSON.stringify(current, null, 2), "utf-8");
      cache = current;
    } catch { /* non-fatal */ }
  };

  // ── Content: use cache if exists, otherwise generate fresh ───────────────────
  let posts: { x: string; instagram: string; tiktok: string; youtube: string; stat: string; subtext: string; pillar: string; theme: string } | undefined;
  let source: "groq" | "bank" | undefined;
  let contentType: "news" | "quote" | "general" = "general";
  let imagePath: string | undefined;
  let bgImagePath: string | undefined;
  let videoPath: string | undefined;

  if (cache) {
    // Retry run — reuse everything from cache
    posts = cache.posts;
    source = cache.source;
    imagePath = cache.imagePath;
    bgImagePath = cache.bgImagePath;
    videoPath = cache.videoPath;
  } else {
    // First run — generate content
    const bankPath = path.join("company", "post-bank.json");
    const bankRaw = await fs.readFile(bankPath, "utf-8").catch(() => null);
    const bank = bankRaw ? JSON.parse(bankRaw) as { last_index: Record<string, number>; morning: unknown[]; evening: unknown[] } : null;
    const bankList = bank?.[session] as Array<{ pillar: string; theme: string; x: string; instagram: string; tiktok: string; youtube: string; stat?: string; subtext?: string }> | undefined;
    // Bank uses date-based deterministic rotation in getFromPostBank — always has content as long as the list is non-empty
    const bankHasContent = !!bankList && bankList.length > 0;

    // Priority 1: news from thelocal.se (primary — always try first when Groq is available)
    if (process.env.GROQ_API_KEY) {
      log(ROLE, "info", "Fetching news from thelocal.se...");
      try {
        const newsResult = await generateFromNews(session);
        if (newsResult) {
          posts = newsResult;
          source = "groq";
          contentType = "news";
          log(ROLE, "info", `News post — Theme: ${posts.theme.slice(0, 60)}`);
        } else {
          log(ROLE, "info", "No relevant news found — falling back to post bank / Groq");
        }
      } catch (err) {
        log(ROLE, "warn", `News fetch failed: ${String(err).slice(0, 80)} — falling back`);
      }
    }

    // Priority 2: famous motivational quote (when no breaking news)
    if (!posts && process.env.GROQ_API_KEY) {
      try {
        log(ROLE, "info", "No news — trying motivational quote...");
        const quoteResult = await generateFromQuote(session);
        if (quoteResult) {
          posts = quoteResult;
          source = "groq";
          contentType = "quote";
          log(ROLE, "info", `Quote post — Theme: ${posts.theme.slice(0, 60)}`);
        }
      } catch (err) {
        log(ROLE, "warn", `Quote generation failed: ${String(err).slice(0, 80)}`);
      }
    }

    // Priority 3: post bank (static fallback)
    if (!posts && bankHasContent) {
      try {
        log(ROLE, "info", `Using post bank (${bankList!.length} themes, date-rotated)...`);
        posts = await getFromPostBank(session);
        source = "bank";
        log(ROLE, "info", `Post bank — Theme: ${posts.theme.slice(0, 60)}`);
      } catch (err) {
        log(ROLE, "warn", `Post bank failed (${String(err).slice(0, 80)}) — falling back to Groq`);
      }
    }

    // Priority 4: Groq random (last resort)
    if (!posts && process.env.GROQ_API_KEY) {
      log(ROLE, "info", "Generating via Groq (random)...");
      try {
        posts = await generateViaGroq(session);
        source = "groq";
        log(ROLE, "info", `Generated — Theme: ${posts.theme.slice(0, 60)}`);
      } catch (err) {
        log(ROLE, "warn", `Groq failed: ${String(err).slice(0, 80)}`);
        throw err;
      }
    }

    if (!posts) {
      throw new Error("No content available — add posts to company/post-bank.json or set GROQ_API_KEY");
    }

    // Archive to markdown
    const filepath = await archivePost(session, posts, source!);
    log(ROLE, "info", `Archived: ${filepath}`);

    // Generate image (returns branded static PNG + raw background PNG)
    const pillarName = CHANNEL.pillars[posts.pillar as keyof typeof CHANNEL.pillars] ?? posts.pillar;
    try {
      const result = await generatePostImage({
        stat: posts.stat || posts.theme,
        subtext: posts.subtext || "",
        pillar: pillarName,
        filename: `${dateString()}-${session}`,
      });
      imagePath   = result.imagePath;
      bgImagePath = result.bgImagePath;
      log(ROLE, "info", `Image generated: ${imagePath}`);
    } catch (err) {
      log(ROLE, "warn", `Image generation failed: ${String(err).slice(0, 80)}`);
    }

    // Generate animated video (Playwright HTML renderer + CSS animations)
    if (imagePath) {
      try {
        videoPath = await generateAnimatedVideo({
          imagePath,
          bgImagePath,          // raw background — no text bleed-through
          stat: posts.stat || posts.theme,
          subtext: posts.subtext || "",
          pillar: pillarName,
          voiceText: posts.instagram,
          filename: `${dateString()}-${session}`,
          musicMood: contentType === "quote" ? "inspirational" : contentType === "news" ? "ambient" : "cultural",
        });
        log(ROLE, "info", `Video generated: ${videoPath}`);
      } catch (err) {
        log(ROLE, "warn", `Animated video failed: ${String(err).slice(0, 80)} — falling back to static video`);
        try {
          videoPath = await generateVideo({ imagePath, voiceText: posts.instagram, filename: `${dateString()}-${session}` });
          log(ROLE, "info", `Static video fallback: ${videoPath}`);
        } catch (err2) {
          log(ROLE, "warn", `Static video fallback also failed: ${String(err2).slice(0, 80)}`);
        }
      }
    }

    // Save cache so retries can reuse everything
    const initialDone = { x: false, tiktok: false, instagram: false, youtube: false };
    try {
      await fs.writeFile(cacheFile, JSON.stringify({
        posts, source, imagePath, bgImagePath, videoPath, done: initialDone,
      }, null, 2), "utf-8");
      cache = { posts, source: source!, imagePath, videoPath, done: initialDone };
    } catch { /* non-fatal */ }
  }

  if (!posts) throw new Error("No content available to post");

  // ── Platform done flags (from cache or fresh) ────────────────────────────────
  const done = { ...(cache?.done ?? { x: false, tiktok: false, instagram: false, youtube: false }) };

  // ── X ────────────────────────────────────────────────────────────────────────
  if (!done.x) {
    try {
      await postViaBrowser(posts.x, imagePath);
      log(ROLE, "info", "✅ X: posted via browser");
      done.x = true;
      await saveDone(done);
    } catch (browserErr) {
      const bMsg = String(browserErr);
      if (bMsg.includes("x-cookies.json") || bMsg.includes("expired")) {
        log(ROLE, "warn", `X browser: ${bMsg.slice(0, 100)}`);
      } else {
        log(ROLE, "warn", `X browser failed: ${bMsg.slice(0, 80)} — trying API`);
        const hasX = process.env.X_API_KEY && process.env.X_API_SECRET &&
          process.env.X_ACCESS_TOKEN && process.env.X_ACCESS_TOKEN_SECRET;
        if (hasX) {
          try {
            const result = await postTweet(posts.x);
            log(ROLE, "info", `✅ X: posted via API — tweet ID: ${result.id}`);
            done.x = true;
            await saveDone(done);
          } catch (apiErr) {
            const aMsg = String(apiErr);
            if (aMsg.includes("CreditsDepleted")) {
              log(ROLE, "warn", "X API: No credits — add credits at developer.twitter.com");
            } else {
              log(ROLE, "error", `X API failed: ${aMsg.slice(0, 100)}`);
            }
          }
        }
      }
    }
  } else {
    log(ROLE, "info", "⏭ X: already posted — skipping");
  }

  // ── TikTok ───────────────────────────────────────────────────────────────────
  if (!done.tiktok) {
    try {
      await postViaTikTok(posts.tiktok, videoPath ?? imagePath);
      log(ROLE, "info", "✅ TikTok: posted via browser");
      done.tiktok = true;
      await saveDone(done);
    } catch (err) {
      log(ROLE, "warn", `TikTok failed: ${String(err).slice(0, 100)}`);
    }
  } else {
    log(ROLE, "info", "⏭ TikTok: already posted — skipping");
  }

  // ── Instagram ────────────────────────────────────────────────────────────────
  await new Promise(r => setTimeout(r, 3000));
  if (!done.instagram) {
    const instagramMedia = videoPath ?? imagePath;
    if (instagramMedia) {
      try {
        await postViaInstagram(posts.instagram, instagramMedia);
        log(ROLE, "info", "✅ Instagram: posted via browser");
        done.instagram = true;
        await saveDone(done);
      } catch (err) {
        log(ROLE, "warn", `Instagram failed: ${String(err).slice(0, 100)}`);
      }
    } else {
      log(ROLE, "warn", "Instagram: skipped (no media)");
    }
  } else {
    log(ROLE, "info", "⏭ Instagram: already posted — skipping");
  }

  // ── YouTube ──────────────────────────────────────────────────────────────────
  if (!done.youtube) {
    if (videoPath) {
      const hasAPIcreds = process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET && process.env.YOUTUBE_REFRESH_TOKEN;
      try {
        if (hasAPIcreds) {
          try {
            await uploadYouTubeShortAPI(posts.youtube, videoPath);
            log(ROLE, "info", "✅ YouTube: uploaded via API");
          } catch (apiErr) {
            log(ROLE, "warn", `YouTube API failed: ${String(apiErr).slice(0, 100)} — trying browser`);
            await uploadYouTubeShortBrowser(posts.youtube, videoPath);
            log(ROLE, "info", "✅ YouTube: uploaded via browser");
          }
        } else {
          await uploadYouTubeShortBrowser(posts.youtube, videoPath);
          log(ROLE, "info", "✅ YouTube: uploaded via browser");
        }
        log(ROLE, "info", "✅ YouTube: uploaded as Short");
        done.youtube = true;
        await saveDone(done);
      } catch (err) {
        log(ROLE, "warn", `YouTube failed: ${String(err).slice(0, 100)}`);
      }
    } else {
      log(ROLE, "warn", "YouTube: skipped (no video)");
    }
  } else {
    log(ROLE, "info", "⏭ YouTube: already posted — skipping");
  }

  // ── Final summary ─────────────────────────────────────────────────────────────
  const succeeded = [done.x && "X", done.tiktok && "TikTok", done.instagram && "Instagram", done.youtube && "YouTube"].filter(Boolean);
  const failed = [!done.x && "X", !done.tiktok && "TikTok", !done.instagram && "Instagram", !done.youtube && "YouTube"].filter(Boolean);
  log(ROLE, "info", `━━━ Summary ━━━ ✅ ${succeeded.join(", ") || "none"} | ❌ ${failed.join(", ") || "none"}`);

  if (failed.length > 0) {
    throw new Error(`RETRY_NEEDED: ${failed.join(", ")} did not post — re-run to retry only failed platforms`);
  }

  try {
    const brain = await readBrain();
    const subs = (brain.channel as Record<string, number>)?.subscribers;
    if (subs) log(ROLE, "info", `Channel: ${subs.toLocaleString()} subscribers`);
  } catch { /* non-fatal */ }
}
