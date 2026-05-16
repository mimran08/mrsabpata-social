#!/bin/bash
# MrSabPata — Morning post with automatic retry
# Runs up to 5 attempts. Skips already-posted platforms on each retry.
# Exits 0 when all 4 platforms are confirmed posted.

cd /Users/imran/Downloads/Claude/mrsabpata
mkdir -p logs

DATE=$(date +%Y-%m-%d)
LOG="logs/morning-${DATE}.log"

echo "" >> "$LOG"
echo "========================================" >> "$LOG"
echo "MORNING POST — $(date)" >> "$LOG"
echo "========================================" >> "$LOG"

MAX_ATTEMPTS=5
RETRY_WAIT=600  # 10 minutes between retries

for attempt in $(seq 1 $MAX_ATTEMPTS); do
  echo "" >> "$LOG"
  echo "--- Attempt ${attempt}/${MAX_ATTEMPTS} — $(date) ---" >> "$LOG"

  # Always refresh cookies and YouTube session before each attempt
  python3 scripts/extract-cookies.py >> "$LOG" 2>&1
  npx tsx --env-file=.env.local scripts/save-youtube-session.ts >> "$LOG" 2>&1

  # Run post (cache file ensures same content is used on retry, failed platforms skipped)
  npx tsx --env-file=.env.local index.ts "post morning" >> "$LOG" 2>&1
  EXIT_CODE=$?

  # Check log for all 4 platform confirmations (✅ or ⏭ both count as done)
  X_DONE=$(grep -cE "(✅ X:|⏭ X:)" "$LOG" 2>/dev/null | tr -d '[:space:]' || echo 0)
  TT_DONE=$(grep -cE "(✅ TikTok:|⏭ TikTok:)" "$LOG" 2>/dev/null | tr -d '[:space:]' || echo 0)
  IG_DONE=$(grep -cE "(✅ Instagram:|⏭ Instagram:)" "$LOG" 2>/dev/null | tr -d '[:space:]' || echo 0)
  YT_DONE=$(grep -cE "(✅ YouTube:|⏭ YouTube:)" "$LOG" 2>/dev/null | tr -d '[:space:]' || echo 0)

  echo "Status: X=${X_DONE} TikTok=${TT_DONE} Instagram=${IG_DONE} YouTube=${YT_DONE}" >> "$LOG"

  if [ "$X_DONE" -gt 0 ] && [ "$TT_DONE" -gt 0 ] && [ "$IG_DONE" -gt 0 ] && [ "$YT_DONE" -gt 0 ]; then
    echo "✅ ALL 4 PLATFORMS CONFIRMED — $(date)" >> "$LOG"
    exit 0
  fi

  if [ $attempt -lt $MAX_ATTEMPTS ]; then
    echo "⚠️  Some platforms pending — waiting ${RETRY_WAIT}s before retry..." >> "$LOG"
    sleep $RETRY_WAIT
  fi
done

echo "❌ Could not confirm all platforms after ${MAX_ATTEMPTS} attempts — check log" >> "$LOG"
exit 1
