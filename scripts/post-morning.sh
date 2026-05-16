#!/bin/bash
# MrSabPata Daily Poster — Morning (9am)

cd /Users/imran/Downloads/Claude/mrsabpata

mkdir -p logs

# Refresh all Safari cookies (keeps sessions alive)
python3 scripts/extract-cookies.py >> logs/morning.log 2>&1

# Save fresh YouTube session
npx tsx --env-file=.env.local scripts/save-youtube-session.ts >> logs/morning.log 2>&1

# Run the post
npx tsx --env-file=.env.local index.ts "post morning" >> logs/morning.log 2>&1
