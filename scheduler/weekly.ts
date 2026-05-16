import { runCompany } from "../commands/run.js";
import { syncYouTubeData } from "../commands/sync.js";
import { log } from "../utils/logger.js";
import { isOptimalYouTubePublishTime, nextOptimalPublishTime } from "../utils/time.js";

const ROLE = "Scheduler";

export async function startWeeklyScheduler(): Promise<void> {
  log(ROLE, "info", "Weekly scheduler started — checking every hour");
  log(ROLE, "info", `Next optimal publish window: ${nextOptimalPublishTime().toISOString()}`);

  const INTERVAL_MS = 60 * 60 * 1000; // 1 hour
  let lastRunDate = "";

  const tick = async () => {
    const today = new Date().toISOString().split("T")[0];

    // Run full company once per week on Tuesday or Thursday at optimal time
    if (isOptimalYouTubePublishTime() && today !== lastRunDate) {
      log(ROLE, "info", "Optimal publish window detected — running full company cycle");
      lastRunDate = today;
      await runCompany().catch(err => log(ROLE, "error", String(err)));
      return;
    }

    // Otherwise just sync data every hour to keep brain current
    log(ROLE, "info", "Hourly sync — updating brain.json with live YouTube data");
    await syncYouTubeData().catch(err => log(ROLE, "error", String(err)));
  };

  await tick();
  setInterval(tick, INTERVAL_MS);
}
