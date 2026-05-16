#!/bin/bash
# MrSabPata — hourly safety check
# Runs every hour. If morning/evening post isn't confirmed yet, triggers it.
# Safe to run anytime — post-safe scripts skip already-confirmed platforms.

cd /Users/imran/Downloads/Claude/mrsabpata
mkdir -p logs

DATE=$(date +%Y-%m-%d)
HOUR=$(date +%H | sed 's/^0//')  # strip leading zero for numeric compare

# ── Morning window: 9am–1pm ───────────────────────────────────────────────────
if [ "$HOUR" -ge 9 ] && [ "$HOUR" -le 13 ]; then
  LOG="logs/morning-${DATE}.log"
  LOCK="/tmp/mrsabpata-morning.lock"

  if grep -q "✅ ALL 4 PLATFORMS CONFIRMED" "$LOG" 2>/dev/null; then
    echo "[$(date)] Hourly check: morning already confirmed ✓" >> "$LOG"
  elif [ -f "$LOCK" ] && kill -0 "$(cat $LOCK)" 2>/dev/null; then
    echo "[$(date)] Hourly check: morning script already running (PID $(cat $LOCK)) — skipping" >> "$LOG"
  else
    echo "[$(date)] Hourly check: morning not confirmed — starting post..." >> "$LOG"
    bash scripts/post-safe-morning.sh >> "$LOG" 2>&1 &
    echo $! > "$LOCK"
    wait
    rm -f "$LOCK"
  fi
fi

# ── Evening window: 6pm–11pm ──────────────────────────────────────────────────
if [ "$HOUR" -ge 18 ] && [ "$HOUR" -le 23 ]; then
  LOG="logs/evening-${DATE}.log"
  LOCK="/tmp/mrsabpata-evening.lock"

  if grep -q "✅ ALL 4 PLATFORMS CONFIRMED" "$LOG" 2>/dev/null; then
    echo "[$(date)] Hourly check: evening already confirmed ✓" >> "$LOG"
  elif [ -f "$LOCK" ] && kill -0 "$(cat $LOCK)" 2>/dev/null; then
    echo "[$(date)] Hourly check: evening script already running (PID $(cat $LOCK)) — skipping" >> "$LOG"
  else
    echo "[$(date)] Hourly check: evening not confirmed — starting post..." >> "$LOG"
    bash scripts/post-safe-evening.sh >> "$LOG" 2>&1 &
    echo $! > "$LOCK"
    wait
    rm -f "$LOCK"
  fi
fi
