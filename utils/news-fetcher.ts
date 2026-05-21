import * as https from "node:https";
import * as http from "node:http";

export interface NewsArticle {
  title: string;
  url: string;
  summary: string;
  publishedAt: string;
  tags: string[];
  relevanceScore: number;
  source: string;
}

// ─── Sources ───────────────────────────────────────────────────────────────────

interface NewsSource {
  name: string;
  pages: string[];
  linkPattern: RegExp;
  baseUrl?: string;   // prepend to relative hrefs
}

const SOURCES: NewsSource[] = [
  {
    name: "The Local Sweden",
    pages: [
      "https://www.thelocal.se/tag/immigration",
      "https://www.thelocal.se/tag/visas",
      "https://www.thelocal.se/tag/work-permits",
      "https://www.thelocal.se/tag/citizenship",
      "https://www.thelocal.se/tag/foreigners",
      "https://www.thelocal.se/tag/integration",
      "https://www.thelocal.se/tag/housing",
      "https://www.thelocal.se/tag/language",
      "https://www.thelocal.se/tag/education",
    ],
    linkPattern: /href="(https:\/\/www\.thelocal\.se\/2\d{7}\/[^"?]+)"/g,
  },
  {
    name: "Schengen Visa Info",
    pages: [
      "https://schengenvisainfo.com/news/sweden/",
      "https://schengenvisainfo.com/sweden-visa/",
    ],
    linkPattern: /href="(https:\/\/schengenvisainfo\.com\/news\/[^"?]+)"/g,
  },
  {
    name: "Migrationsverket",
    pages: [
      "https://www.migrationsverket.se/English/About-the-Migration-Agency/News-archive.html",
    ],
    linkPattern: /href="(\/English\/About-the-Migration-Agency\/News-archive\/[^"?]+\.html)"/g,
    baseUrl: "https://www.migrationsverket.se",
  },
];

// ─── Relevance keywords ────────────────────────────────────────────────────────

const HIGH_RELEVANCE = [
  "visa", "permit", "residence", "migration", "immigrant", "newcomer",
  "expat", "citizen", "citizenship", "foreigner", "asylum", "refugee",
  "work permit", "personnummer", "migration agency", "migrationsverket",
  "integration", "language test", "sfi", "housing", "andrahand",
  "employment", "job", "salary", "tax", "healthcare", "school", "family",
  "sweden", "swedish", "nordic", "scandinavia",
];

const LOW_RELEVANCE = [
  "restaurant", "recipe", "food", "fashion", "sport", "football",
  "crossword", "quiz", "weather", "travel tips", "holiday", "tourism",
  "celebrity", "entertainment",
];

// ─── HTTP helpers ──────────────────────────────────────────────────────────────

async function fetchUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
    }, (res) => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
      res.on("error", reject);
    });
    req.on("error", reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error("Timeout")); });
  });
}

function cleanHtml(html: string): string {
  return html
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&#\d+;/g, "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function scoreRelevance(text: string): number {
  const lower = text.toLowerCase();
  let score = 0;
  for (const kw of HIGH_RELEVANCE) if (lower.includes(kw)) score += 2;
  for (const kw of LOW_RELEVANCE)  if (lower.includes(kw)) score -= 3;
  return score;
}

// ─── Per-source link extraction ────────────────────────────────────────────────

function extractLinks(html: string, source: NewsSource): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];
  const re = new RegExp(source.linkPattern.source, source.linkPattern.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    let url = m[1].split("?")[0];
    if (source.baseUrl && url.startsWith("/")) url = source.baseUrl + url;
    if (!seen.has(url)) { seen.add(url); urls.push(url); }
  }
  return urls.slice(0, 15);
}

// ─── Article metadata (works via og: tags across all sources) ─────────────────

async function fetchArticleMeta(url: string): Promise<{ title: string; summary: string; publishedAt: string }> {
  const html = await fetchUrl(url);

  const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/) ??
                     html.match(/<meta name="og:title" content="([^"]+)"/) ??
                     html.match(/<title[^>]*>([^<]+)<\/title>/);
  const descMatch  = html.match(/<meta property="og:description" content="([^"]+)"/) ??
                     html.match(/<meta name="description" content="([^"]+)"/) ??
                     html.match(/<meta content="([^"]{30,})" name="description"/);
  const dateMatch  = html.match(/<meta property="article:published_time" content="([^"]+)"/) ??
                     html.match(/"datePublished":\s*"([^"]+)"/) ??
                     html.match(/<time[^>]+datetime="([^"]+)"/);

  return {
    title:       cleanHtml(titleMatch?.[1] ?? ""),
    summary:     cleanHtml(descMatch?.[1] ?? ""),
    publishedAt: dateMatch?.[1] ?? new Date().toISOString(),
  };
}

// ─── Main export ───────────────────────────────────────────────────────────────

export async function fetchRelevantNews(maxArticles = 5): Promise<NewsArticle[]> {
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const allCandidates: Array<{ url: string; source: string }> = [];
  const seenUrls = new Set<string>();

  // Scrape each source's listing pages (2 at a time to avoid rate limits)
  for (const source of SOURCES) {
    const pageBatches: string[][] = [];
    for (let i = 0; i < source.pages.length; i += 2) {
      pageBatches.push(source.pages.slice(i, i + 2));
    }
    for (const batch of pageBatches) {
      const results = await Promise.allSettled(batch.map(fetchUrl));
      for (const r of results) {
        if (r.status !== "fulfilled") continue;
        const links = extractLinks(r.value, source);
        for (const url of links) {
          if (!seenUrls.has(url)) { seenUrls.add(url); allCandidates.push({ url, source: source.name }); }
        }
      }
    }
  }

  // Fetch article metadata in batches of 5 (up to 40 candidates total)
  const toFetch = allCandidates.slice(0, 40);
  const articles: NewsArticle[] = [];
  for (let i = 0; i < toFetch.length; i += 5) {
    const batch = toFetch.slice(i, i + 5);
    const results = await Promise.allSettled(
      batch.map(({ url, source }) => fetchArticleMeta(url).then(meta => ({ url, source, ...meta })))
    );
    for (const r of results) {
      if (r.status !== "fulfilled") continue;
      const { url, source, title, summary, publishedAt } = r.value;
      if (!title || !summary) continue;

      const pubTime = new Date(publishedAt).getTime();
      if (pubTime < sevenDaysAgo || isNaN(pubTime)) continue;

      const score = scoreRelevance(`${title} ${summary}`);
      if (score <= 0) continue;

      articles.push({ title, url, summary, publishedAt, tags: [], relevanceScore: score, source });
    }
  }

  articles.sort((a, b) =>
    b.relevanceScore !== a.relevanceScore
      ? b.relevanceScore - a.relevanceScore
      : new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );

  return articles.slice(0, maxArticles);
}
