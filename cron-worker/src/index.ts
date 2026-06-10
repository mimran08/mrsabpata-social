// Cloudflare Worker that triggers the mrsabpata GitHub Actions workflows on schedule.
// GitHub's own cron drifts 1-4h on shared runners; Cloudflare's cron fires on the minute.
//
// Crons defined in wrangler.toml:
//   - 0 14 * * *  → evening-post-mac.yml (16:00 Stockholm CEST)
//
// 2026-06-10: dropped morning cron (was twice/day) — now posting once a day.
// The morning-post-mac.yml workflow still exists for manual workflow_dispatch
// runs (e.g. recovery), but is no longer auto-triggered.

interface Env {
  GH_TOKEN: string;       // GitHub PAT or OAuth token with 'workflow' scope (set as secret)
  REPO_OWNER: string;
  REPO_NAME: string;
}

export default {
  async scheduled(_event: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    // Single cron entry "0 14 * * *" UTC = 16:00 Stockholm CEST.
    // -mac variant runs on the self-hosted Mac runner where Chrome works;
    // CI WebKit + Xvfb hangs silently for 26+ min.
    const workflow = "evening-post-mac.yml";

    const url = `https://api.github.com/repos/${env.REPO_OWNER}/${env.REPO_NAME}/actions/workflows/${workflow}/dispatches`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.GH_TOKEN}`,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "mrsabpata-cron-worker",
      },
      body: JSON.stringify({ ref: "main" }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`Trigger failed ${res.status}: ${body.slice(0, 300)}`);
      throw new Error(`Trigger failed: ${res.status}`);
    }
    console.log(`Triggered ${workflow}`);
  },

  // Optional: HTTP endpoint for manual testing — `curl https://<worker>.workers.dev/?w=morning-post.yml`
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const w = url.searchParams.get("w");
    if (!w || !/^(morning|evening)-post(-mac)?\.yml$/.test(w)) {
      return new Response("usage: ?w=morning-post-mac.yml or ?w=evening-post-mac.yml (or the cloud variants)", { status: 400 });
    }
    const apiUrl = `https://api.github.com/repos/${env.REPO_OWNER}/${env.REPO_NAME}/actions/workflows/${w}/dispatches`;
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.GH_TOKEN}`,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "mrsabpata-cron-worker",
      },
      body: JSON.stringify({ ref: "main" }),
    });
    const body = await res.text();
    return new Response(`status: ${res.status}\n${body}`, { status: res.ok ? 200 : 500 });
  },
};
