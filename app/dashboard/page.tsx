import type { Metadata } from "next";
import { getChannelStats, getLatestVideos, getVideoById, formatDuration } from "../../lib/youtube";

export const metadata: Metadata = {
  title: "Channel Stats — MrSabPata",
  description: "Live YouTube channel analytics for MrSabPata.",
};

export const revalidate = 3600;

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

export default async function DashboardPage() {
  const [stats, searchItems] = await Promise.all([
    getChannelStats(),
    getLatestVideos(5),
  ]);

  const videoIds: string[] = searchItems.map((item: { id: { videoId: string } }) => item.id.videoId);
  const videos = await Promise.all(videoIds.map((id: string) => getVideoById(id)));

  const avgViews = videos.length > 0
    ? Math.round(videos.reduce((sum: number, v: { statistics?: { viewCount?: string } } | null) => sum + Number(v?.statistics?.viewCount ?? 0), 0) / videos.length)
    : 0;

  const statCards = [
    { label: "Subscribers", value: formatCount(stats.subscriberCount), icon: "👥" },
    { label: "Total Views", value: formatCount(stats.totalViews), icon: "👁" },
    { label: "Videos", value: stats.videoCount.toString(), icon: "🎬" },
    { label: "Avg. Views / Video", value: formatCount(avgViews), icon: "📊" },
  ];

  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      <h1 className="text-3xl font-bold text-white mb-2">Channel Stats</h1>
      <p className="text-gray-400 mb-10">
        Live data · updated every hour ·{" "}
        <a
          href="https://www.youtube.com/@MrSabPata"
          target="_blank"
          rel="noopener noreferrer"
          className="text-red-500 hover:text-red-400"
        >
          @MrSabPata
        </a>
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
        {statCards.map((card) => (
          <div key={card.label} className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <div className="text-2xl mb-2">{card.icon}</div>
            <div className="text-3xl font-bold text-white mb-1">{card.value}</div>
            <div className="text-sm text-gray-400">{card.label}</div>
          </div>
        ))}
      </div>

      <h2 className="text-xl font-bold text-white mb-4">Recent Videos</h2>
      <div className="space-y-3">
        {videos.map((video: {
          id: string;
          snippet?: { title?: string; publishedAt?: string; thumbnails?: { medium?: { url?: string } } };
          statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
          contentDetails?: { duration?: string };
        } | null) => {
          if (!video) return null;
          const views = Number(video.statistics?.viewCount ?? 0);
          const likes = Number(video.statistics?.likeCount ?? 0);
          const duration = formatDuration(video.contentDetails?.duration ?? "PT0S");
          const published = video.snippet?.publishedAt?.split("T")[0] ?? "";
          return (
            <a
              key={video.id}
              href={`https://www.youtube.com/watch?v=${video.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-4 bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-600 transition-colors"
            >
              {video.snippet?.thumbnails?.medium?.url && (
                <img
                  src={video.snippet.thumbnails.medium.url}
                  alt={video.snippet?.title ?? ""}
                  className="w-32 h-18 object-cover rounded-lg flex-shrink-0"
                  width={128}
                  height={72}
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-white font-medium truncate">{video.snippet?.title}</p>
                <p className="text-gray-400 text-sm mt-1">
                  {formatCount(views)} views · {likes} likes · {duration} · {published}
                </p>
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}
