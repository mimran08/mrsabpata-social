import { log } from "./utils/logger.js";
import { syncYouTubeData } from "./commands/sync.js";
import { runCompany } from "./commands/run.js";

const COMPANY = "MrSabPata Media Company";

const COMMANDS: Record<string, () => Promise<void>> = {
  "run company": async () => {
    log(COMPANY, "info", "Starting full company run...");
    await runCompany();
  },
  "sync data": async () => {
    log(COMPANY, "info", "Syncing live YouTube data into brain...");
    await syncYouTubeData();
  },
  "company status": async () => {
    const { readBrain } = await import("./company/brain.js");
    const brain = await readBrain();
    const channel = brain.channel as Record<string, number>;
    const focus = brain.current_focus as string;
    const nextVideo = brain.next_video as Record<string, string>;
    log(COMPANY, "info", "─────────────────────────────────────────");
    log(COMPANY, "info", `  Subscribers : ${channel?.subscribers?.toLocaleString() ?? "—"}`);
    log(COMPANY, "info", `  Total views : ${channel?.total_views_lifetime?.toLocaleString() ?? "—"}`);
    log(COMPANY, "info", `  Videos      : ${channel?.video_count ?? "—"}`);
    log(COMPANY, "info", `  Focus       : ${focus ?? "—"}`);
    log(COMPANY, "info", `  Next video  : ${nextVideo?.title || "none queued"} (${nextVideo?.script_status ?? "—"})`);
    log(COMPANY, "info", `  Brain updated: ${brain.last_updated as string}`);
    log(COMPANY, "info", "─────────────────────────────────────────");
  },
  "weekly strategy": async () => {
    const { runWeeklyStrategy } = await import("./roles/ceo.js");
    log(COMPANY, "info", "Running weekly strategy session...");
    await runWeeklyStrategy();
  },
  "start scheduler": async () => {
    const { startWeeklyScheduler } = await import("./scheduler/weekly.js");
    log(COMPANY, "info", "Starting weekly scheduler — press Ctrl+C to stop");
    await startWeeklyScheduler();
  },
  "post morning": async () => {
    const { postDailyContent } = await import("./scheduler/daily.js");
    await postDailyContent("morning");
  },
  "post evening": async () => {
    const { postDailyContent } = await import("./scheduler/daily.js");
    await postDailyContent("evening");
  },
  "extract cookies": async () => {
    const { execSync } = await import("node:child_process");
    execSync("python3 scripts/extract-cookies.py", { stdio: "inherit" });
  },
  "extract x cookies": async () => {
    const { execSync } = await import("node:child_process");
    execSync("python3 scripts/extract-cookies.py", { stdio: "inherit" });
  },
  "setup youtube": async () => {
    const { execSync } = await import("node:child_process");
    execSync("npx tsx --env-file=.env.local scripts/save-youtube-session.ts", { stdio: "inherit" });
  },
  "setup instagram": async () => {
    const { execSync } = await import("node:child_process");
    execSync("npx tsx --env-file=.env.local scripts/save-instagram-session.ts", { stdio: "inherit" });
  },
  "setup tiktok": async () => {
    const { execSync } = await import("node:child_process");
    execSync("npx tsx --env-file=.env.local scripts/save-tiktok-session.ts", { stdio: "inherit" });
  },
};

const command = process.argv.slice(2).join(" ") || "company status";

async function main() {
  log(COMPANY, "info", `Command: "${command}"`);

  const handler = COMMANDS[command];
  if (!handler) {
    log(COMPANY, "warn", `Unknown command: "${command}"`);
    log(COMPANY, "info", `Available commands: ${Object.keys(COMMANDS).join(", ")}`);
    process.exit(1);
  }

  await handler();
}

main().catch((err) => {
  log(COMPANY, "error", String(err));
  process.exit(1);
});
