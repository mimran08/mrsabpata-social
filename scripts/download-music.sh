#!/bin/bash
# Download royalty-free background music for MrSabPata posts.
# Uses Mixkit (free, no attribution required) and Pixabay Music.
# Run once to expand the music library: bash scripts/download-music.sh

MUSIC_DIR="$(cd "$(dirname "$0")/.." && pwd)/music"
mkdir -p "$MUSIC_DIR/inspirational" "$MUSIC_DIR/ambient" "$MUSIC_DIR/cultural"

dl() {
  local url="$1" dest="$2"
  [ -f "$dest" ] && { echo "  skip: $(basename "$dest")"; return; }
  echo "  → $(basename "$dest")"
  curl -L --silent --show-error --max-time 30 -o "$dest" "$url" || echo "    FAILED"
  # Validate: must be > 50KB
  local size
  size=$(wc -c < "$dest" 2>/dev/null || echo 0)
  if [ "$size" -lt 51200 ]; then
    rm -f "$dest"
    echo "    removed (too small — download failed)"
  fi
}

echo "Downloading inspirational tracks (for quote posts)..."
dl "https://assets.mixkit.co/music/preview/mixkit-inspiring-life-574.mp3"   "$MUSIC_DIR/inspirational/inspiring-life.mp3"
dl "https://assets.mixkit.co/music/preview/mixkit-motivational-drums-2090.mp3" "$MUSIC_DIR/inspirational/motivational-drums.mp3"
dl "https://assets.mixkit.co/music/preview/mixkit-serene-view-443.mp3"     "$MUSIC_DIR/inspirational/serene-view.mp3"

echo "Downloading ambient tracks (for news posts)..."
dl "https://assets.mixkit.co/music/preview/mixkit-tech-house-vibes-130.mp3" "$MUSIC_DIR/ambient/tech-house.mp3"
dl "https://assets.mixkit.co/music/preview/mixkit-a-very-happy-christmas-897.mp3" "$MUSIC_DIR/ambient/soft-ambient.mp3"
dl "https://assets.mixkit.co/music/preview/mixkit-sleepy-cat-135.mp3"      "$MUSIC_DIR/ambient/sleepy-cat.mp3"

echo "Downloading cultural tracks (general posts)..."
dl "https://assets.mixkit.co/music/preview/mixkit-middle-eastern-path-158.mp3" "$MUSIC_DIR/cultural/middle-eastern.mp3"
dl "https://assets.mixkit.co/music/preview/mixkit-ethnic-sound-593.mp3"    "$MUSIC_DIR/cultural/ethnic-sound.mp3"
dl "https://assets.mixkit.co/music/preview/mixkit-world-beat-vibes-460.mp3" "$MUSIC_DIR/cultural/world-beat.mp3"

echo ""
echo "Music library:"
for dir in inspirational ambient cultural; do
  count=$(ls "$MUSIC_DIR/$dir"/*.mp3 2>/dev/null | wc -l | tr -d ' ')
  echo "  $dir: $count track(s)"
done
echo ""
echo "If tracks show 0, visit https://mixkit.co/free-stock-music/ and download"
echo "tracks manually into music/inspirational, music/ambient, or music/cultural."
