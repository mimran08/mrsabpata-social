import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Search",
  description: "Search videos on mrsabpata.",
};

export default function SearchPage() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <h1 className="text-3xl font-bold text-white mb-6">Search</h1>
      <input
        type="search"
        placeholder="Search videos..."
        className="w-full bg-gray-900 border border-gray-700 rounded-xl px-5 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-red-600 transition-colors"
      />
      <p className="text-gray-500 text-sm mt-4">Search functionality will be wired to the YouTube API.</p>
    </div>
  );
}
