// Cloudflare Worker that triggers the mrsabpata GitHub Actions workflows on schedule.
// GitHub's own cron drifts 1-4h on shared runners; Cloudflare's cron fires on the minute.
//
// Crons defined in wrangler.toml:
//   - 0 7 * * *   → morning-post.yml (09:00 Stockholm CEST)
//   - 0 16 * * *  → evening-post.yml (18:00 Stockholm CEST)

interface Env {
  GH_TOKEN: string;       // GitHub PAT or OAuth token with 'workflow' scope (set as secret)
  REPO_OWNER: string;
  REPO_NAME: string;
}

export default {
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    // Single cron entry "0 7,16 * * *" fires at both 07:00 UTC and 16:00 UTC.
    // Use the firing time's UTC hour to pick which workflow to dispatch.
    // Use the -mac variants — they run on the self-hosted Mac runner where
    // X browser (Chrome) actually works. CI WebKit + Xvfb hangs silently for 26+ min.
    const utcHour = new Date(event.scheduledTime).getUTCHours();
    const workflow = utcHour === 7 ? "morning-post-mac.yml"
                   : utcHour === 16 ? "evening-post-mac.yml"
                   : null;

    if (!workflow) {
      console.error(`Cron fired at unexpected hour: ${utcHour}`);
      return;
    }

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
    console.log(`Triggered ${workflow} via cron ${cron}`);
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
