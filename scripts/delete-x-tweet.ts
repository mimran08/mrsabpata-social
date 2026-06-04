// One-off: delete a specific X tweet by ID using saved cookies.
// Usage: npx tsx --env-file=.env.local scripts/delete-x-tweet.ts <tweet_id>
import { chromium } from "playwright";
import * as fs from "node:fs/promises";
import * as path from "node:path";

async function main() {
  const tweetId = process.argv[2];
  if (!tweetId) throw new Error("Usage: scripts/delete-x-tweet.ts <tweet_id>");

  const raw = JSON.parse(await fs.readFile(path.join("company", "x-cookies.json"), "utf-8")) as { cookies: Array<Record<string, unknown>> };
  type CookieIn = { name: string; value: string; domain: string; path: string; expires?: number; httpOnly?: boolean; secure?: boolean; sameSite?: string };
  const cookies = (raw.cookies as CookieIn[]).map(c => {
    const ss = c.sameSite;
    const sameSite: "None" | "Strict" | "Lax" =
      ss === "None" || ss === "Strict" || ss === "Lax" ? ss : "Lax";
    return { ...c, sameSite };
  });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addCookies(cookies);
  const page = await context.newPage();

  try {
    await page.goto("https://x.com/home", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const result = await page.evaluate(async (id) => {
      const ct0 = document.cookie.match(/ct0=([^;]+)/)?.[1] || "";
      const res = await fetch("https://x.com/i/api/graphql/VaenaVgh5q5ih7kvyVjgtg/DeleteTweet", {
        method: "POST", credentials: "include",
        headers: {
          "Authorization": "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA",
          "Content-Type": "application/json",
          "x-csrf-token": ct0,
        },
        body: JSON.stringify({ variables: { tweet_id: id, dark_request: false }, queryId: "VaenaVgh5q5ih7kvyVjgtg" }),
      });
      return { status: res.status, body: (await res.text()).slice(0, 200) };
    }, tweetId);
    console.log(JSON.stringify(result));
  } finally {
    await browser.close();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
