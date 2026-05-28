#!/bin/bash
# Generate 6 distinct ambient drone tracks using ffmpeg.
# These are programmatically synthesized (we own the rights) so they will NEVER
# trigger a YouTube Content ID claim — unlike the previous library which had
# "Lofi Study by FASSounds" tracks claimed by HAAWK on 2026-05-28.
#
# Each track is ~120s of layered sine waves + lowpass + reverb-style echo.
# Frequencies vary per track for distinct mood. Output is .mp3 at 192k mono.
#
# Run with:  bash scripts/generate-music.sh

set -e
MUSIC_DIR="$(cd "$(dirname "$0")/.." && pwd)/music"
mkdir -p "$MUSIC_DIR/inspirational" "$MUSIC_DIR/ambient" "$MUSIC_DIR/cultural"

# Master generator. Args: out_path, freq_root_hz, harmonic_ratio, color_filter, duration_secs
gen() {
  local out="$1" f1="$2" f2="$3" f3="$4" color="$5" dur="${6:-120}"
  echo "  → $(basename "$out")  (${f1}Hz + ${f2}Hz + ${f3}Hz, $color)"

  # 3 layered sines + slow tremolo modulation + lowpass color + reverb-like echo + fade in/out
  ffmpeg -y -hide_banner -loglevel error \
    -f lavfi -t "$dur" -i "sine=frequency=$f1:beep_factor=0:sample_rate=44100" \
    -f lavfi -t "$dur" -i "sine=frequency=$f2:beep_factor=0:sample_rate=44100" \
    -f lavfi -t "$dur" -i "sine=frequency=$f3:beep_factor=0:sample_rate=44100" \
    -filter_complex "
      [0:a]volume=0.42,tremolo=f=0.18:d=0.20[a1];
      [1:a]volume=0.28,tremolo=f=0.13:d=0.22[a2];
      [2:a]volume=0.18,tremolo=f=0.10:d=0.18[a3];
      [a1][a2][a3]amix=inputs=3:normalize=0[m];
      [m]${color}[c];
      [c]aecho=0.6:0.3:850|1700:0.30|0.18[r];
      [r]afade=t=in:st=0:d=4,afade=t=out:st=$((dur-4)):d=4,volume=0.85[out]
    " \
    -map "[out]" -ac 1 -ar 44100 -c:a libmp3lame -b:a 192k "$out"
}

echo "Generating ambient tracks (for news posts)..."
# Warm low drone — 80Hz fundamental, harmonics, lowpass at 1.5k
gen "$MUSIC_DIR/ambient/warm-low-drone.mp3"   80   160   240  "lowpass=f=1500" 120
# Cold pad — 110Hz fundamental, brighter harmonics, lowpass at 2k
gen "$MUSIC_DIR/ambient/cold-pad.mp3"        110   220   330  "lowpass=f=2000" 120

echo "Generating cultural tracks (general posts)..."
# Earthy harmonics — A2 / E3 / A3 (220Hz family), warmer lowpass
gen "$MUSIC_DIR/cultural/earthy-pad.mp3"     110   165   220  "lowpass=f=1300,bass=g=3" 120
# Modal drift — D3 / A3 / D4
gen "$MUSIC_DIR/cultural/modal-drift.mp3"    146.83 220   293.66 "lowpass=f=1700" 120

echo "Generating inspirational tracks (for quote / motivational posts)..."
# Lifted bright — C4 / E4 / G4 (C major triad), brighter
gen "$MUSIC_DIR/inspirational/lifted-bright.mp3" 261.63 329.63 392.00 "lowpass=f=2500" 120
# Open fifths — A3 / E4 / A4 (open feel, no third)
gen "$MUSIC_DIR/inspirational/open-fifths.mp3"   220   329.63 440  "lowpass=f=2200" 120

echo ""
echo "Generated library:"
for dir in ambient cultural inspirational; do
  count=$(ls "$MUSIC_DIR/$dir"/*.mp3 2>/dev/null | wc -l | tr -d ' ')
  size=$(du -sh "$MUSIC_DIR/$dir" 2>/dev/null | awk '{print $1}')
  echo "  $dir: $count track(s) ($size)"
done
echo ""
echo "All tracks are programmatically synthesized — no Content ID risk."
