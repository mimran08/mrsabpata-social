#!/bin/bash
# MrSabPata Daily Poster — Evening (6pm)

cd /Users/imran/Downloads/Claude/mrsabpata

mkdir -p logs

# Refresh all Safari cookies (keeps sessions alive)
python3 scripts/extract-cookies.py >> logs/evening.log 2>&1

# Save fresh YouTube session
npx tsx --env-file=.env.local scripts/save-youtube-session.ts >> logs/evening.log 2>&1

# Run the post
npx tsx --env-file=.env.local index.ts "post evening" >> logs/evening.log 2>&1
