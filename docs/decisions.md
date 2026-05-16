# Architecture Decisions

━━━━━━━━━━━━━━━━━━━━━━━━
📋 DECISION: Framework — Next.js 15 App Router
Date: 2026-05-11
Context: Needed SSR + SEO for YouTube channel platform
Decision: Next.js 15 with App Router, TypeScript, Tailwind
Decided by: User + Architect
Tradeoffs accepted: Slightly more complex than plain React, but needed for SEO and ISR caching of YouTube API responses
━━━━━━━━━━━━━━━━━━━━━━━━

━━━━━━━━━━━━━━━━━━━━━━━━
📋 DECISION: YouTube Data API v3 for data
Date: 2026-05-11
Context: Need real channel stats and video listings
Decision: YouTube Data API v3 with server-side fetching + ISR (revalidate every 30–60 min)
Decided by: Backend + Architect
Tradeoffs accepted: Requires API key setup; quota limits at scale
Review date: When >10k daily users
━━━━━━━━━━━━━━━━━━━━━━━━
