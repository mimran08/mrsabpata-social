// Manual X poster — reads today's archived post + image and submits to @MrSabPata.
// X API is broken (402 CreditsDepleted on free tier), so this is invoked manually
// after the cron run completes. Usage:
//   npx tsx --env-file=.env.local scripts/post-x-manual.ts morning
//   npx tsx --env-file=.env.local scripts/post-x-manual.ts evening
//   npx tsx --env-file=.env.local scripts/post-x-manual.ts morning --text "override text"
//   npx tsx --env-file=.env.local scripts/post-x-manual.ts morning --image /path/to.png

import { chromium } from "playwright";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { log } from "../utils/logger.js";

const ROLE = "X-Manual";

// @MrSabPata's user ID — the twid cookie MUST match this, otherwise we're about to
// post on the wrong account (2026-05-24 incident: extract-x-cookies.py grabbed
// @GeoCricLive's cookies because that was Safari's active X account).
const MRSABPATA_TWID = "u%3D1605805926";

function parseArchive(md: string): { x: string; theme: string } {
  const x = md.match(/## X \/ Twitter\s*\n+([\s\S]*?)\n+---/)?.[1].trim() ?? "";
  const theme = md.match(/\*\*Theme:\*\*\s*(.+)/)?.[1].trim() ?? "(unknown)";
  return { x, theme };
}

async function findArchive(session: "morning" | "evening"): Promise<{ archivePath: string; imagePath: string }> {
  const today = new Date().toISOString().slice(0, 10);
  // Check local first, then the self-hosted runner's workspace
  const roots = [process.cwd(), `${process.env.HOME}/actions-runner/_work/mrsabpata-social/mrsabpata-social`];

  // Prefer -recovery.md archive when present — recovery scripts write it when the
  // cron-generated content gets deleted (e.g. duplicate news). Without this we'd
  // post the stale cron text on X even after the other platforms were repaired.
  const archiveNames = [`${today}-${session}-recovery.md`, `${today}-${session}.md`];

  for (const root of roots) {
    for (const archiveName of archiveNames) {
      const archive = path.join(root, "company", "daily-posts", archiveName);
      if (!(await fs.access(archive).then(() => true).catch(() => false))) continue;

      const filenameStem = archiveName.replace(/\.md$/, "");
      const imageCandidates = [
        path.join(root, "company", "post-images", `${filenameStem}-x.png`),
        path.join(root, "company", "post-images", `${filenameStem}.png`),
      ];
      for (const img of imageCandidates) {
        if (await fs.access(img).then(() => true).catch(() => false)) {
          return { archivePath: archive, imagePath: img };
        }
      }
      throw new Error(`Archive ${archive} found but no matching image (tried ${imageCandidates.join(", ")})`);
    }
  }
  throw new Error(`No ${today}-${session}.md archive found in cwd or runner workspace`);
}

async function loadCookies(): Promise<unknown[]> {
  const raw = JSON.parse(await fs.readFile(path.join("company", "x-cookies.json"), "utf-8")) as { cookies: Array<Record<string, unknown>> };
  // Normalize sameSite values for playwright
  return raw.cookies.map(c => ({
    ...c,
    sameSite: ["None", "Strict", "Lax"].includes(c.sameSite as string) ? c.sameSite : "Lax",
  }));
}

async function main() {
  const args = process.argv.slice(2);
  const session = (args[0] === "morning" || args[0] === "evening") ? args[0] : null;
  if (!session) throw new Error("Usage: scripts/post-x-manual.ts <morning|evening> [--text 'override'] [--image /path]");

  const overrideText = args.indexOf("--text") >= 0 ? args[args.indexOf("--text") + 1] : null;
  const overrideImage = args.indexOf("--image") >= 0 ? args[args.indexOf("--image") + 1] : null;

  let xText: string;
  let imagePath: string;
  let theme = "(override)";

  if (overrideText && overrideImage) {
    xText = overrideText;
    imagePath = overrideImage;
  } else {
    const { archivePath, imagePath: foundImage } = await findArchive(session);
    const md = await fs.readFile(archivePath, "utf-8");
    const parsed = parseArchive(md);
    xText = overrideText ?? parsed.x;
    imagePath = overrideImage ?? foundImage;
    theme = parsed.theme;
  }

  if (!xText) throw new Error("No X text found in archive");
  if (xText.length > 270) {
    // X's character counter weights some chars >1 (em-dash, emoji, unicode); 270 is
    // the safe ceiling in practice. 277-char post got rejected on 2026-05-25 morning.
    log(ROLE, "warn", `X text is ${xText.length} chars (>270 safe ceiling) — X may reject. Trim the post-bank entry.`);
  }

  log(ROLE, "info", `Theme: ${theme}`);
  log(ROLE, "info", `Text (${xText.length} chars): ${xText.slice(0, 80)}...`);
  log(ROLE, "info", `Image: ${imagePath}`);

  const cookies = await loadCookies();
  const twid = (cookies as Array<{ name: string; value: string }>).find(c => c.name === "twid")?.value;
  if (twid !== MRSABPATA_TWID) {
    throw new Error(`Cookies are for the wrong X account (twid=${twid}). Need ${MRSABPATA_TWID} (@MrSabPata). Switch Safari to @MrSabPata, then re-run: python3 scripts/extract-x-cookies.py`);
  }

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addCookies(cookies as Parameters<typeof context.addCookies>[0]);
  const page = await context.newPage();

  try {
    await page.goto("https://x.com/compose/post", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2500);

    if (page.url().includes("/login") || page.url().includes("/i/flow")) {
      throw new Error("X session expired — re-run: python3 scripts/extract-x-cookies.py");
    }

    const ta = page.locator('div[role="dialog"] [data-testid="tweetTextarea_0"]').first();
    await ta.waitFor({ state: "visible", timeout: 15000 });
    await ta.pressSequentially(xText, { delay: 10 });
    await page.waitForTimeout(300);
    await page.keyboard.press("Escape"); // dismiss any hashtag autocomplete
    await page.waitForTimeout(300);

    // Attach image via direct file input — bypasses the overlay-intercepted media button
    const fileInput = page.locator('div[role="dialog"] input[data-testid="fileInput"]').first();
    await fileInput.setInputFiles(path.resolve(imagePath));
    log(ROLE, "info", "Image attached — waiting for upload");
    await page.waitForTimeout(3000);

    // Verify media preview rendered before submit (otherwise we'd post text-only)
    const hasMedia = await page.evaluate(() =>
      !!document.querySelector('div[role="dialog"] [data-testid="attachments"] img, div[role="dialog"] img[src*="blob:"]')
    );
    if (!hasMedia) {
      await page.screenshot({ path: `logs/debug-x-no-media-${Date.now()}.png` }).catch(() => {});
      throw new Error("Image preview did not appear after setInputFiles — aborting");
    }

    // Submit
    const beforeUrl = page.url();
    await page.evaluate(() => {
      const btn = document.querySelector('div[role="dialog"] [data-testid="tweetButton"]') as HTMLButtonElement | null;
      if (btn?.getAttribute("aria-disabled") === "true") throw new Error("Post button is disabled (text over 280 chars?)");
      btn?.click();
    });
    await page.waitForURL((u) => !u.toString().includes("/compose"), { timeout: 15000 }).catch(() => {});

    if (page.url() === beforeUrl) {
      await page.screenshot({ path: `logs/debug-x-submit-failed-${Date.now()}.png` }).catch(() => {});
      throw new Error("X submit failed — still on /compose. Possible duplicate-content rejection ('You already said that').");
    }

    // Verify the new tweet shows on profile
    await page.goto("https://x.com/MrSabPata", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);
    const latest = await page.evaluate(() => {
      const art = document.querySelector("article");
      return {
        link: art?.querySelector('a[href*="/status/"]')?.getAttribute("href"),
        time: art?.querySelector("time")?.getAttribute("datetime"),
        text: art?.querySelector('[data-testid="tweetText"]')?.textContent?.slice(0, 60),
        hasImage: !!art?.querySelector('[data-testid="tweetPhoto"] img, img[src*="pbs.twimg.com/media"]'),
      };
    });
    log(ROLE, "info", `✅ Posted: https://x.com${latest.link} (image: ${latest.hasImage ? "yes" : "NO"}, time: ${latest.time})`);
    if (!latest.hasImage) log(ROLE, "warn", "Tweet posted but profile doesn't show image — investigate");
  } finally {
    await browser.close();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
