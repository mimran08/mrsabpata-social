import { getLatestVideos, getVideoById, formatDuration, formatViewCount } from "../lib/youtube";

export const revalidate = 1800;

export default async function Home() {
  const searchItems = await getLatestVideos(6);
  const videoIds: string[] = searchItems.map((item: { id: { videoId: string } }) => item.id.videoId);
  const videos = await Promise.all(videoIds.map((id: string) => getVideoById(id)));

  return (
    <div className="max-w-6xl mx-auto px-6 py-16">
      {/* Hero */}
      <section className="text-center mb-16">
        <h1 className="text-5xl font-bold text-white mb-4">MrSabPata</h1>
        <p className="text-xl text-gray-400 max-w-xl mx-auto mb-8">
          Real stories about immigration, careers, and life as a Pakistani in Sweden.
        </p>
        <div className="flex gap-4 justify-center">
          <a
            href="https://www.youtube.com/@MrSabPata?sub_confirmation=1"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-full font-semibold transition-colors"
          >
            Subscribe on YouTube
          </a>
          <a
            href="/dashboard"
            className="border border-gray-600 hover:border-gray-400 text-gray-300 hover:text-white px-6 py-3 rounded-full font-semibold transition-colors"
          >
            Channel Stats
          </a>
        </div>
      </section>

      {/* Latest Videos */}
      <section>
        <h2 className="text-2xl font-bold text-white mb-6">Latest Videos</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {videos.map((video: {
            id: string;
            snippet?: { title?: string; publishedAt?: string; thumbnails?: { medium?: { url?: string } } };
            statistics?: { viewCount?: string };
            contentDetails?: { duration?: string };
          } | null) => {
            if (!video) return null;
            const views = Number(video.statistics?.viewCount ?? 0);
            const duration = formatDuration(video.contentDetails?.duration ?? "PT0S");
            return (
              <a
                key={video.id}
                href={`https://www.youtube.com/watch?v=${video.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-gray-900 rounded-xl overflow-hidden border border-gray-800 hover:border-gray-600 transition-colors group"
              >
                <div className="relative aspect-video bg-gray-800">
                  {video.snippet?.thumbnails?.medium?.url && (
                    <img
                      src={video.snippet.thumbnails.medium.url}
                      alt={video.snippet?.title ?? ""}
                      className="w-full h-full object-cover group-hover:opacity-90 transition-opacity"
                      width={320}
                      height={180}
                    />
                  )}
                  <span className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-1.5 py-0.5 rounded">
                    {duration}
                  </span>
                </div>
                <div className="p-4">
                  <p className="text-white font-medium text-sm line-clamp-2 mb-1">{video.snippet?.title}</p>
                  <p className="text-gray-500 text-xs">{formatViewCount(views)} views</p>
                </div>
              </a>
            );
          })}
        </div>
      </section>
    </div>
  );
}
