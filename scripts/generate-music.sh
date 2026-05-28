#!/bin/bash
# Generate 6 ambient tracks with a Pakistani/cultural mood — tabla-like pulse
# under sitar/tanpura-style drone harmonics. All synthesized with ffmpeg
# (we own them, zero Content ID risk).
#
# Each track ~120s, ~3MB, layered:
#   - Drone bass (low sine — tanpura-like)
#   - Mid-range harmonics (sitar-like odd harmonics, octaves + fifths)
#   - Tabla-like rhythmic pulse (short exponentially-decaying low sine)
#   - Lowpass + bass boost + light echo for warmth
#
# Run with:  bash scripts/generate-music.sh

set -e
MUSIC_DIR="$(cd "$(dirname "$0")/.." && pwd)/music"
mkdir -p "$MUSIC_DIR/inspirational" "$MUSIC_DIR/ambient" "$MUSIC_DIR/cultural"

# ─── Generator helper ─────────────────────────────────────────────────────────
# Builds a track from:
#   - drone freq (Hz)        — tanpura root
#   - sitar harmonic ratios — comma-separated list of multiplicators e.g. "2,3,5"
#   - tabla pulse interval (s)  — beat rate (0 = no tabla)
#   - tabla pitch (Hz)       — typically 50-90Hz for low dha/dhin feel
#   - duration (s)           — default 120
#   - extra audio filters   — appended to filter chain
gen() {
  local out="$1" drone="$2" harms="$3" tabla_i="$4" tabla_p="$5" dur="${6:-120}"
  echo "  → $(basename "$out")  drone=${drone}Hz tabla=${tabla_p}Hz@${tabla_i}s"

  # Sitar harmonic expression: sum of sines at drone × ratio. No spaces — ffmpeg's
  # aevalsrc parser splits on `:` and treats whitespace as separator boundaries.
  local sitar_expr="0.30*sin(2*PI*${drone}*t)"
  IFS=',' read -ra ratios <<< "$harms"
  local idx=0
  for r in "${ratios[@]}"; do
    idx=$((idx + 1))
    local amp
    amp=$(awk -v i="$idx" 'BEGIN { printf "%.3f", 0.18 / (i * 0.8 + 0.2) }')
    sitar_expr="${sitar_expr}+${amp}*sin(2*PI*${drone}*${r}*t)"
  done

  # Tabla pulse: exp-decaying low sine repeating every tabla_i seconds. Two
  # alternating hits (root + octave) for a tabla-like dha/dhin feel.
  # Note: commas inside ffmpeg filter expressions must be escaped with \,
  # (the parser uses raw `,` as an option separator).
  local tabla_p2=$((tabla_p * 2))
  local half_i
  half_i=$(awk -v t="$tabla_i" 'BEGIN { printf "%.4f", t / 2 }')
  local tabla_expr="0.42*exp(-22*mod(t\\,${tabla_i}))*sin(2*PI*${tabla_p}*t)+0.18*exp(-18*mod(t+${half_i}\\,${tabla_i}))*sin(2*PI*${tabla_p2}*t)"

  ffmpeg -y -hide_banner -loglevel error \
    -f lavfi -t "$dur" -i "aevalsrc=${sitar_expr}:s=44100" \
    -f lavfi -t "$dur" -i "aevalsrc=${tabla_expr}:s=44100" \
    -filter_complex "[0:a]volume=0.85,tremolo=f=0.12:d=0.15[sitar];[1:a]volume=0.95[tabla];[sitar][tabla]amix=inputs=2:normalize=0[mix];[mix]lowpass=f=2400,bass=g=4,treble=g=-2[col];[col]aecho=0.5:0.4:520|1100:0.28|0.16[rev];[rev]afade=t=in:st=0:d=4,afade=t=out:st=$((dur-4)):d=4,volume=0.88[out]" \
    -map "[out]" -ac 1 -ar 44100 -c:a libmp3lame -b:a 192k "$out"
}

# Frequency reference (Hz):
#   C2=65.4, D2=73.4, E2=82.4, G2=98, A2=110, B2=123.5
#   C3=130.8, D3=146.8, E3=164.8, G3=196, A3=220
# Tabla feel: 80-100 BPM = 0.6 to 0.75s per beat

echo "Generating ambient tracks (for news posts)..."
# Sufi calm — A2 root with octave + 5th harmonics, slow tabla 0.75s (80 BPM)
gen "$MUSIC_DIR/ambient/sufi-calm.mp3"      110 "2,3,4" 0.75 65 120
# Tanpura drift — D3 root, fuller harmonics, slow tabla 0.7s (~86 BPM)
gen "$MUSIC_DIR/ambient/tanpura-drift.mp3"  146.83 "2,3,5,6" 0.7 70 120

echo "Generating cultural tracks (general posts)..."
# Sitar evening — A2 with rich odd harmonics (sitar-like), medium tabla 0.65s (~92 BPM)
gen "$MUSIC_DIR/cultural/sitar-evening.mp3" 110 "2,3,5,7,9" 0.65 70 120
# Bansuri dawn — D3 with simpler bright harmonics (flute-like), faster tabla 0.6s (~100 BPM)
gen "$MUSIC_DIR/cultural/bansuri-dawn.mp3"  146.83 "2,3,4,5" 0.6 75 120

echo "Generating inspirational tracks (for quote / motivational posts)..."
# Ghazal mood — G2 root with romantic 3rd + 5th + 7th, gentle tabla 0.75s
gen "$MUSIC_DIR/inspirational/ghazal-mood.mp3" 98 "2,3,4,5,6" 0.75 60 120
# Lifted bright — D3 with bright harmonics, lighter tabla 0.65s
gen "$MUSIC_DIR/inspirational/qawwali-rise.mp3" 146.83 "2,3,5,8" 0.65 70 120

echo ""
echo "Generated library:"
for dir in ambient cultural inspirational; do
  count=$(ls "$MUSIC_DIR/$dir"/*.mp3 2>/dev/null | wc -l | tr -d ' ')
  size=$(du -sh "$MUSIC_DIR/$dir" 2>/dev/null | awk '{print $1}')
  echo "  $dir: $count track(s) ($size)"
done
echo ""
echo "All tracks are synthesized in-house — no Content ID risk."
