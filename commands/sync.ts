import { fetchChannelStats, fetchRecentVideos } from "../platforms/youtube.js";
import { readBrain, writeBrain } from "../company/brain.js";
import { log } from "../utils/logger.js";

const ROLE = "Data Sync";

export async function syncYouTubeData(): Promise<void> {
  log(ROLE, "info", "Fetching live YouTube channel data...");

  const [stats, videos] = await Promise.all([
    fetchChannelStats(),
    fetchRecentVideos(10),
  ]);

  const brain = await readBrain();
  const channel = brain.channel as Record<string, number> | undefined;
  const previousSubs = channel?.subscribers ?? 0;

  const recentVideosSummary = videos.slice(0, 5).map(v => ({
    title: v.title,
    views: v.views,
    likes: v.likes,
    comments: v.comments,
    duration_seconds: v.durationSeconds,
    published_at: v.publishedAt.split("T")[0],
  }));

  await writeBrain({
    channel: {
      subscribers: stats.subscribers,
      total_views_lifetime: stats.totalViews,
      video_count: stats.videoCount,
    },
    recent_videos: recentVideosSummary,
  });

  const subDelta = stats.subscribers - previousSubs;
  const sign = subDelta >= 0 ? "+" : "";

  log(ROLE, "info", "─────────────────────────────────────────");
  log(ROLE, "info", `  Subscribers : ${stats.subscribers.toLocaleString()}  (${sign}${subDelta} vs brain)`);
  log(ROLE, "info", `  Total views : ${stats.totalViews.toLocaleString()}  (lifetime)`);
  log(ROLE, "info", `  Video count : ${stats.videoCount}`);
  log(ROLE, "info", `  Videos synced : ${videos.length}`);

  if (videos.length > 0) {
    log(ROLE, "info", "  ─── Recent videos ───");
    for (const v of videos.slice(0, 5)) {
      const mins = Math.floor(v.durationSeconds / 60);
      const secs = String(v.durationSeconds % 60).padStart(2, "0");
      log(ROLE, "info", `    [${mins}:${secs}] "${v.title}" — ${v.views} views · ${v.likes} likes · ${v.comments} comments`);
    }
  }

  log(ROLE, "info", "─────────────────────────────────────────");
  log(ROLE, "info", "Brain updated with live data ✓");
}
