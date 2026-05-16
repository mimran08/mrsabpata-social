const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID;
const BASE_URL = "https://www.googleapis.com/youtube/v3";

export async function getChannelStats() {
  const res = await fetch(
    `${BASE_URL}/channels?part=statistics&id=${CHANNEL_ID}&key=${YOUTUBE_API_KEY}`,
    { next: { revalidate: 3600 } }
  );
  if (!res.ok) throw new Error("Failed to fetch channel stats");
  const data = await res.json();
  const stats = data.items?.[0]?.statistics;
  return {
    subscriberCount: Number(stats?.subscriberCount ?? 0),
    totalViews: Number(stats?.viewCount ?? 0),
    videoCount: Number(stats?.videoCount ?? 0),
    lastUpdated: new Date().toISOString(),
  };
}

export async function getLatestVideos(maxResults = 12) {
  const res = await fetch(
    `${BASE_URL}/search?part=snippet&channelId=${CHANNEL_ID}&maxResults=${maxResults}&order=date&type=video&key=${YOUTUBE_API_KEY}`,
    { next: { revalidate: 1800 } }
  );
  if (!res.ok) throw new Error("Failed to fetch videos");
  const data = await res.json();
  return data.items ?? [];
}

export async function getVideoById(videoId: string) {
  const res = await fetch(
    `${BASE_URL}/videos?part=snippet,statistics,contentDetails&id=${videoId}&key=${YOUTUBE_API_KEY}`,
    { next: { revalidate: 3600 } }
  );
  if (!res.ok) throw new Error("Failed to fetch video");
  const data = await res.json();
  return data.items?.[0] ?? null;
}

export function formatViewCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return count.toString();
}

export function formatDuration(iso: string): string {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return "0:00";
  const h = parseInt(match[1] ?? "0");
  const m = parseInt(match[2] ?? "0");
  const s = parseInt(match[3] ?? "0");
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}
