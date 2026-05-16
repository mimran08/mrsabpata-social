import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Videos",
  description: "All videos from the mrsabpata YouTube channel.",
};

export default function VideosPage() {
  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      <h1 className="text-3xl font-bold text-white mb-2">Videos</h1>
      <p className="text-gray-400 mb-10">All uploads from the mrsabpata channel.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="bg-gray-900 rounded-xl overflow-hidden border border-gray-800 animate-pulse">
            <div className="aspect-video bg-gray-800" />
            <div className="p-4 space-y-2">
              <div className="h-4 bg-gray-700 rounded" />
              <div className="h-3 bg-gray-800 rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
