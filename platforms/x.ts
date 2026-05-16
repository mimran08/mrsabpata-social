import * as crypto from "node:crypto";
import { PlatformError } from "../utils/errors.js";
import { withRetry } from "../utils/retry.js";

const ROLE = "x";
const API_BASE = "https://api.twitter.com/2";

function env(name: string): string {
  const val = process.env[name];
  if (!val) throw new PlatformError("x", "MISSING_ENV", `${name} is not set`);
  return val;
}

function buildOAuthHeader(method: string, url: string, bodyParams: Record<string, string> = {}): string {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: env("X_API_KEY"),
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: env("X_ACCESS_TOKEN"),
    oauth_version: "1.0",
  };

  const allParams = { ...bodyParams, ...oauthParams };
  const sortedPairs = Object.keys(allParams)
    .sort()
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(allParams[k])}`)
    .join("&");

  const signatureBase = [method.toUpperCase(), encodeURIComponent(url), encodeURIComponent(sortedPairs)].join("&");
  const signingKey = `${encodeURIComponent(env("X_API_SECRET"))}&${encodeURIComponent(env("X_ACCESS_TOKEN_SECRET"))}`;
  const signature = crypto.createHmac("sha1", signingKey).update(signatureBase).digest("base64");

  oauthParams["oauth_signature"] = signature;

  return (
    "OAuth " +
    Object.keys(oauthParams)
      .sort()
      .map(k => `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k])}"`)
      .join(", ")
  );
}

async function xPost(endpoint: string, body: Record<string, unknown>): Promise<unknown> {
  const url = `${API_BASE}${endpoint}`;
  const oauthHeader = buildOAuthHeader("POST", url);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: oauthHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new PlatformError("x", `HTTP_${res.status}`, text.slice(0, 300));
  }

  return res.json();
}

export interface TweetResult {
  id: string;
  text: string;
}

export async function postTweet(text: string, replyToId?: string): Promise<TweetResult> {
  const body: Record<string, unknown> = { text };
  if (replyToId) body.reply = { in_reply_to_tweet_id: replyToId };

  const data = await withRetry(() => xPost("/tweets", body), ROLE) as { data: TweetResult };
  return data.data;
}

export async function postThread(tweets: string[]): Promise<TweetResult[]> {
  if (tweets.length === 0) throw new PlatformError("x", "EMPTY_THREAD", "Thread must have at least one tweet");

  const results: TweetResult[] = [];
  let previousId: string | undefined;

  for (const text of tweets) {
    const result = await postTweet(text, previousId);
    results.push(result);
    previousId = result.id;
    // Small delay between tweets to avoid rate limits
    await new Promise(r => setTimeout(r, 500));
  }

  return results;
}
