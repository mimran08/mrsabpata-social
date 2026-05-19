# TikTok API Setup — Progress Notes

## Status: paused

Cookie-based posting via [platforms/tiktok-browser.ts](../platforms/tiktok-browser.ts) is working. Switched away from API path due to scope of TikTok approval flow + Direct Post gating.

## What exists (don't delete)

### TikTok dev app
- App ID: `7641509624444880913`
- Owner: mimrans@gmail.com (Individual)
- Production client_key: `awavs6fqqnjwmq2r`
- Sandbox client_key: `sbaw4ue6hcg9kjlaxf` (sandbox ID `7641523656580990977`, label `mrsabpata-test`)
- Sandbox target user added: @mrsabpata
- Production config complete: icon (SP monogram), category Social Networking, ToS + Privacy URLs pointing to GitHub Pages, description, Web platform + Web/Desktop URL, Login Kit + Content Posting API added
- Sandbox config: basics filled — products + scopes don't persist via Apply changes (TikTok portal quirk; needs to be re-added inside each session)

### Credentials saved
In `.env.local` (NOT pushed to GitHub Secrets):
- `TIKTOK_CLIENT_KEY` (production)
- `TIKTOK_CLIENT_SECRET` (production)
- `TIKTOK_SANDBOX_CLIENT_KEY`
- `TIKTOK_SANDBOX_CLIENT_SECRET`

### Code scaffolding
- [scripts/setup-tiktok-oauth.ts](../scripts/setup-tiktok-oauth.ts) — PKCE OAuth flow against sandbox, captures refresh token
- [scripts/gen-tiktok-icon.ts](../scripts/gen-tiktok-icon.ts) — generates 1024×1024 SP-monogram icon
- [docs/index.html](index.html), [docs/terms.html](terms.html), [docs/privacy.html](privacy.html) — hosted at https://mimran08.github.io/mrsabpata-social/ for TikTok dev app requirements

## To resume later

1. **Sandbox products bug** — Add products + scopes inside the sandbox UI, but don't reload the page until OAuth is tested. The "Apply changes" doesn't persist products across reloads reliably.
2. **OAuth flow** — Run `npx tsx --env-file=.env.local scripts/setup-tiktok-oauth.ts`. Requires PKCE (S256). Captures `TIKTOK_REFRESH_TOKEN`, `TIKTOK_ACCESS_TOKEN`, `TIKTOK_OPEN_ID`.
3. **`video.publish` gating** — Sandbox + standard production approval only grants `video.upload` (drafts mode = manual tap-to-post in TikTok app). Direct posting requires audited Login Kit review = extra weeks of approval + non-guaranteed.
4. **Demo video** — TikTok production review requires a screen recording showing the OAuth flow + content upload end-to-end. Needs sandbox working first.
5. **Production submission** — Click "Submit for review" in the production tab. Wait 5–14 days.

## Why we paused

- Chrome-extraction cookie path proved reliable (~2 min refresh when session dies)
- Direct posting unlikely without audited Login Kit
- ~5 hours invested; portal quirks were eating time without progress
