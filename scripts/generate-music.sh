#!/bin/bash
# Download 6 CC0 background music tracks from Pixabay Music CDN.
#
# Why Pixabay? The Pixabay Music license is CC0 — tracks are guaranteed
# NOT registered with any Content ID system. The previous library used
# "Lofi Study by FASSounds" which got claimed by HAAWK on 2026-05-28
# (Allama Iqbal video on YouTube). The synthesized ffmpeg fallback that
# replaced it sounded too thin. These real Pixabay tracks are full
# instrumental productions with no claim risk.
#
# Track URLs were scraped from pixabay.com/music/search/* pages (the
# CDN at cdn.pixabay.com/audio/ is publicly accessible with no API key
# required). If a URL 404s in the future (Pixabay rarely removes tracks),
# replace with another from the same search tag.
#
# Run with:  bash scripts/generate-music.sh

set -e
MUSIC_DIR="$(cd "$(dirname "$0")/.." && pwd)/music"
mkdir -p "$MUSIC_DIR/inspirational" "$MUSIC_DIR/ambient" "$MUSIC_DIR/cultural"

dl() {
  local url="$1" dest="$2"
  if [ -f "$dest" ]; then
    echo "  skip: $(basename "$dest") (already exists)"
    return
  fi
  echo "  → $(basename "$dest")"
  curl -sL --max-time 60 -o "$dest" "$url" || { echo "    FAILED"; return 1; }
  local size
  size=$(wc -c < "$dest")
  if [ "$size" -lt 51200 ]; then
    rm -f "$dest"
    echo "    removed (too small — download failed)"
    return 1
  fi
}

echo "Downloading from Pixabay Music CDN (CC0, no Content ID risk)..."
echo ""
echo "Cultural (Indian/Pakistani feel — for general posts):"
dl "https://cdn.pixabay.com/audio/2026/04/18/audio_406970c878.mp3" "$MUSIC_DIR/cultural/pixabay-indian-warm.mp3"
dl "https://cdn.pixabay.com/audio/2025/11/20/audio_4ab6954810.mp3" "$MUSIC_DIR/cultural/pixabay-indian-evening.mp3"

echo ""
echo "Ambient (for news posts):"
dl "https://cdn.pixabay.com/audio/2026/05/05/audio_bedae80d67.mp3" "$MUSIC_DIR/ambient/pixabay-ambient-calm.mp3"
dl "https://cdn.pixabay.com/audio/2026/04/21/audio_076e2f430b.mp3" "$MUSIC_DIR/ambient/pixabay-ambient-soft.mp3"

echo ""
echo "Inspirational (for quote / motivational posts):"
dl "https://cdn.pixabay.com/audio/2026/05/02/audio_3a8e8a9159.mp3" "$MUSIC_DIR/inspirational/pixabay-world-rise.mp3"
dl "https://cdn.pixabay.com/audio/2026/03/24/audio_b892f478f3.mp3" "$MUSIC_DIR/inspirational/pixabay-world-uplift.mp3"

echo ""
echo "Library summary:"
for dir in ambient cultural inspirational; do
  count=$(ls "$MUSIC_DIR/$dir"/*.mp3 2>/dev/null | wc -l | tr -d ' ')
  size=$(du -sh "$MUSIC_DIR/$dir" 2>/dev/null | awk '{print $1}')
  echo "  $dir: $count track(s) ($size)"
done
