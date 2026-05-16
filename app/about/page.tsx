import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About",
  description: "About the mrsabpata YouTube channel.",
};

export default function AboutPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <h1 className="text-3xl font-bold text-white mb-6">About mrsabpata</h1>
      <div className="prose prose-invert text-gray-300 space-y-4">
        <p>Welcome to mrsabpata — update this page with your channel description, niche, and what viewers can expect.</p>
        <p>
          Subscribe on YouTube to stay up to date with the latest content.
        </p>
      </div>
      <div className="mt-10">
        <a
          href="https://www.youtube.com/@mrsabpata"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-full font-semibold transition-colors"
        >
          Subscribe on YouTube
        </a>
      </div>
    </div>
  );
}
