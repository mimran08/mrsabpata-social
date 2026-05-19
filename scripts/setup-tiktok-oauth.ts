// One-time OAuth flow to capture a TikTok refresh token for the @mrsabpata account.
// Uses the sandbox app (TIKTOK_SANDBOX_CLIENT_KEY / TIKTOK_SANDBOX_CLIENT_SECRET).
// Usage: npx tsx --env-file=.env.local scripts/setup-tiktok-oauth.ts

import * as http from "node:http";
import * as fs from "node:fs/promises";
import * as crypto from "node:crypto";
import { exec } from "node:child_process";

const REDIRECT_URI = "http://127.0.0.1:8765/callback";
// Scopes: user.info.basic is auto-included; video.upload writes drafts;
// video.publish does direct-to-feed but requires audited Login Kit (post-review).
const SCOPE = "user.info.basic,video.upload";

// TikTok requires PKCE — generate a code verifier + challenge
const codeVerifier = crypto.randomBytes(48).toString("base64url");
const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");

async function main() {
  const clientKey = process.env.TIKTOK_SANDBOX_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_SANDBOX_CLIENT_SECRET;
  if (!clientKey || !clientSecret) {
    console.error("Missing TIKTOK_SANDBOX_CLIENT_KEY / TIKTOK_SANDBOX_CLIENT_SECRET in env");
    process.exit(1);
  }

  const authUrl = new URL("https://www.tiktok.com/v2/auth/authorize/");
  authUrl.searchParams.set("client_key", clientKey);
  authUrl.searchParams.set("scope", SCOPE);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authUrl.searchParams.set("state", "mrsabpata-setup");
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  console.log("Auth URL:", authUrl.toString());

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
        res.writeHead(400, { "Content-Type": "text/plain" }).end(`OAuth error: ${err} — ${url.searchParams.get("error_description") ?? ""}`);
        server.close();
        reject(new Error(err));
        return;
      }
      if (!c) {
        res.writeHead(400, { "Content-Type": "text/plain" }).end("Missing code");
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html" }).end(
        "<html><body><h2>Authorized.</h2><p>You can close this tab.</p></body></html>"
      );
      setTimeout(() => server.close(), 500);
      resolve(c);
    });
    server.listen(8765, "127.0.0.1");
  });

  console.log("Opening browser for authorization...");
  exec(`open "${authUrl.toString()}"`);

  console.log(`Got code (${code.length} chars). Exchanging for tokens...`);

  const tokenRes = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Cache-Control": "no-cache" },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: REDIRECT_URI,
      code_verifier: codeVerifier,
    }),
  });

  const tokenText = await tokenRes.text();
  if (!tokenRes.ok) {
    throw new Error(`Token exchange failed ${tokenRes.status}: ${tokenText}`);
  }

  const tokens = JSON.parse(tokenText) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    open_id?: string;
    scope?: string;
    error?: string;
    error_description?: string;
  };

  if (!tokens.refresh_token) {
    throw new Error(`TikTok didn't return refresh_token: ${JSON.stringify(tokens)}`);
  }

  // Write to .env.local
  const envPath = ".env.local";
  let envText = await fs.readFile(envPath, "utf-8").catch(() => "");
  const updates: Record<string, string> = {
    TIKTOK_REFRESH_TOKEN: tokens.refresh_token,
    TIKTOK_ACCESS_TOKEN: tokens.access_token ?? "",
    TIKTOK_OPEN_ID: tokens.open_id ?? "",
  };
  for (const [k, v] of Object.entries(updates)) {
    if (new RegExp(`^${k}=.*$`, "m").test(envText)) {
      envText = envText.replace(new RegExp(`^${k}=.*$`, "m"), `${k}=${v}`);
    } else {
      envText += (envText.endsWith("\n") ? "" : "\n") + `${k}=${v}\n`;
    }
  }
  await fs.writeFile(envPath, envText);

  console.log("\n✅ Saved TIKTOK_REFRESH_TOKEN, TIKTOK_ACCESS_TOKEN, TIKTOK_OPEN_ID to .env.local");
  console.log(`Scopes granted: ${tokens.scope}`);
  console.log(`Access token expires in: ${tokens.expires_in}s`);
}

main().catch(err => {
  console.error("Setup failed:", err);
  process.exit(1);
});
