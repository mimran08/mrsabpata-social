export interface Video {
  id: string;
  title: string;
  description: string;
  slug: string;
  thumbnailUrl: string;
  videoUrl: string;
  youtubeId: string;
  publishedAt: string;
  duration: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  tags: string[];
  category: VideoCategory;
}

export type VideoCategory =
  | "vlog"
  | "tutorial"
  | "review"
  | "shorts"
  | "collaboration"
  | "other";

export interface ChannelStats {
  subscriberCount: number;
  totalViews: number;
  videoCount: number;
  lastUpdated: string;
}

export interface SearchResult {
  videos: Video[];
  total: number;
  query: string;
}
