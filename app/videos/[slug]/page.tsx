import type { Metadata } from "next";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: slug.replace(/-/g, " "),
  };
}

export default async function VideoPage({ params }: Props) {
  const { slug } = await params;

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <div className="aspect-video bg-gray-900 rounded-xl mb-6 flex items-center justify-center border border-gray-800">
        <p className="text-gray-500 text-sm">Video player — connect YouTube API to load: {slug}</p>
      </div>
      <h1 className="text-2xl font-bold text-white mb-2 capitalize">{slug.replace(/-/g, " ")}</h1>
      <p className="text-gray-400 text-sm">Video details will load once the YouTube API is configured.</p>
    </div>
  );
}
