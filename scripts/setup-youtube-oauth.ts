// One-time OAuth flow to capture a YouTube refresh token.
// Usage:
//   1. Put YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET in .env.local
//      (from Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client ID
//       of type "Desktop application")
//   2. npx tsx --env-file=.env.local scripts/setup-youtube-oauth.ts
//   3. Browser opens to Google login → authorize "Manage your YouTube videos"
//   4. Script captures the code, exchanges for refresh token, appends to .env.local
//
// After this runs once you should:
//   - Push the new YOUTUBE_REFRESH_TOKEN to GitHub Secrets
//   - Re-issue the GitHub secret with the (matching) CLIENT_ID and CLIENT_SECRET too
//     since the old ones produced an "invalid_client" error in CI

import * as http from "node:http";
import * as fs from "node:fs/promises";
import { exec } from "node:child_process";

const REDIRECT_URI = "http://127.0.0.1:8765/callback";
const SCOPE = "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube";

async function main() {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error("Missing YOUTUBE_CLIENT_ID or YOUTUBE_CLIENT_SECRET in env.");
    console.error("Add them to .env.local from Google Cloud Console → Credentials → Desktop OAuth client.");
    process.exit(1);
  }

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", SCOPE);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");

  console.log("\nStarting local callback server on http://127.0.0.1:8765 ...");
  const code: string = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1:8765");
      if (url.pathname !== "/callback") {
        res.writeHead(404).end();
        return;
      }
      const c = url.searchParams.get("code");
      const err = url.searchParams.get("error");
      if (err) {
        res.writeHead(400, { "Content-Type": "text/plain" }).end(`OAuth error: ${err}`);
        server.close();
        reject(new Error(err));
        return;
      }
      if (!c) {
        res.writeHead(400, { "Content-Type": "text/plain" }).end("Missing code");
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html" }).end(
        "<html><body><h2>Authorized.</h2><p>You can close this tab and return to the terminal.</p></body></html>"
      );
      setTimeout(() => server.close(), 500);
      resolve(c);
    });
    server.listen(8765, "127.0.0.1");
  });

  console.log("Opening browser for authorization...");
  exec(`open "${authUrl.toString()}"`);

  // (above) — actually wait, exec happens AFTER server starts but BEFORE we await the code.
  // Re-order is fine because the server is already listening synchronously. The await
  // above blocks until the callback fires.

  console.log(`Got authorization code (${code.length} chars). Exchanging for refresh token...`);

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`Token exchange failed ${tokenRes.status}: ${err}`);
  }

  const tokens = await tokenRes.json() as { refresh_token?: string; access_token: string };
  if (!tokens.refresh_token) {
    throw new Error(
      "Google didn't return a refresh_token. This usually means you've authorized this client before — " +
      "go to https://myaccount.google.com/permissions, remove the app, then re-run this script."
    );
  }

  // Write/update YOUTUBE_REFRESH_TOKEN in .env.local
  const envPath = ".env.local";
  let envText = await fs.readFile(envPath, "utf-8").catch(() => "");
  if (/^YOUTUBE_REFRESH_TOKEN=.*$/m.test(envText)) {
    envText = envText.replace(/^YOUTUBE_REFRESH_TOKEN=.*$/m, `YOUTUBE_REFRESH_TOKEN=${tokens.refresh_token}`);
  } else {
    envText = envText + (envText.endsWith("\n") ? "" : "\n") + `YOUTUBE_REFRESH_TOKEN=${tokens.refresh_token}\n`;
  }
  await fs.writeFile(envPath, envText);

  console.log("\n✅ Refresh token saved to .env.local");
  console.log("\nNext steps:");
  console.log("  1. Verify it works locally:");
  console.log("       npx tsx --env-file=.env.local -e 'import(\"./platforms/youtube-api.js\")'");
  console.log("  2. Push the three secrets to GitHub:");
  console.log("       gh secret set YOUTUBE_CLIENT_ID --body \"$YOUTUBE_CLIENT_ID\"");
  console.log("       gh secret set YOUTUBE_CLIENT_SECRET --body \"$YOUTUBE_CLIENT_SECRET\"");
  console.log("       gh secret set YOUTUBE_REFRESH_TOKEN --body \"$YOUTUBE_REFRESH_TOKEN\"");
}

main().catch(err => {
  console.error("Setup failed:", err);
  process.exit(1);
});
