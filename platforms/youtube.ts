import { PlatformError } from "../utils/errors.js";
import { withRetry } from "../utils/retry.js";

const ROLE = "youtube";
const BASE = "https://www.googleapis.com/youtube/v3";

function env(name: string): string {
  const val = process.env[name];
  if (!val) throw new PlatformError("youtube", "MISSING_ENV", `${name} is not set`);
  return val;
}

export interface ChannelStats {
  subscribers: number;
  totalViews: number;
  videoCount: number;
}

export interface VideoStats {
  id: string;
  title: string;
  publishedAt: string;
  views: number;
  likes: number;
  comments: number;
  durationSeconds: number;
  thumbnailUrl: string;
}

async function apiFetch(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new PlatformError("youtube", `HTTP_${res.status}`, body.slice(0, 200));
  }
  return res.json();
}

export async function fetchChannelStats(): Promise<ChannelStats> {
  const key = env("YOUTUBE_API_KEY");
  const id = env("YOUTUBE_CHANNEL_ID");

  const data = await withRetry(
    () => apiFetch(`${BASE}/channels?part=statistics&id=${id}&key=${key}`),
    ROLE,
  ) as { items?: Array<{ statistics: { subscriberCount: string; viewCount: string; videoCount: string } }> };

  const stats = data.items?.[0]?.statistics;
  if (!stats) throw new PlatformError("youtube", "NO_CHANNEL", "Channel not found — check YOUTUBE_CHANNEL_ID");

  return {
    subscribers: Number(stats.subscriberCount),
    totalViews: Number(stats.viewCount),
    videoCount: Number(stats.videoCount),
  };
}

export async function fetchRecentVideos(maxResults = 10): Promise<VideoStats[]> {
  const key = env("YOUTUBE_API_KEY");
  const id = env("YOUTUBE_CHANNEL_ID");

  type SearchItem = {
    id: { videoId: string };
    snippet: { title: string; publishedAt: string; thumbnails: { medium: { url: string } } };
  };

  const searchData = await withRetry(
    () => apiFetch(`${BASE}/search?part=snippet&channelId=${id}&maxResults=${maxResults}&order=date&type=video&key=${key}`),
    ROLE,
  ) as { items?: SearchItem[] };

  const items = searchData.items ?? [];
  if (items.length === 0) return [];

  const ids = items.map(i => i.id.videoId).join(",");
  const snippetMap = new Map(items.map(i => [i.id.videoId, i.snippet]));

  type VideoItem = {
    id: string;
    statistics: { viewCount?: string; likeCount?: string; commentCount?: string };
    contentDetails: { duration: string };
  };

  const videoData = await withRetry(
    () => apiFetch(`${BASE}/videos?part=statistics,contentDetails&id=${ids}&key=${key}`),
    ROLE,
  ) as { items?: VideoItem[] };

  return (videoData.items ?? []).map(v => {
    const snippet = snippetMap.get(v.id);
    return {
      id: v.id,
      title: snippet?.title ?? "",
      publishedAt: snippet?.publishedAt ?? "",
      views: Number(v.statistics.viewCount ?? 0),
      likes: Number(v.statistics.likeCount ?? 0),
      comments: Number(v.statistics.commentCount ?? 0),
      durationSeconds: parseDuration(v.contentDetails.duration),
      thumbnailUrl: snippet?.thumbnails?.medium?.url ?? "",
    };
  });
}

export async function fetchVideoComments(videoId: string, maxResults = 50): Promise<string[]> {
  const key = env("YOUTUBE_API_KEY");

  type CommentItem = {
    snippet: { topLevelComment: { snippet: { textDisplay: string } } };
  };

  const data = await withRetry(
    () => apiFetch(`${BASE}/commentThreads?part=snippet&videoId=${videoId}&maxResults=${maxResults}&order=relevance&key=${key}`),
    ROLE,
  ) as { items?: CommentItem[]; error?: { code: number } };

  if (!data.items) return [];

  return data.items.map(item => item.snippet.topLevelComment.snippet.textDisplay);
}

function parseDuration(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (parseInt(m[1] ?? "0") * 3600) + (parseInt(m[2] ?? "0") * 60) + parseInt(m[3] ?? "0");
}
