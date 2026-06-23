// Cloudflare Worker that triggers the mrsabpata GitHub Actions workflows on schedule.
// GitHub's own cron drifts 1-4h on shared runners; Cloudflare's cron fires on the minute.
//
// Crons defined in wrangler.toml:
//   - 0 17 * * *  → evening-post-mac.yml      (19:00 Stockholm CEST, daily)
//   - 0 9 * * 0   → weekly-carousel-mac.yml   (11:00 Stockholm CEST, Sundays)
//
// 2026-06-23: shifted daily from 16:00 → 19:00 Stockholm (peak Pakistan time)
// + added Sunday weekly carousel (story panels reposted as IG carousel for
// 1.4x reach lift over single Reels).

interface Env {
  GH_TOKEN: string;       // GitHub PAT or OAuth token with 'workflow' scope (set as secret)
  REPO_OWNER: string;
  REPO_NAME: string;
}

export default {
  async scheduled(event: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    // Pick workflow by firing time's UTC hour:
    //   17:00 UTC = 19:00 Stockholm → daily evening post
    //   09:00 UTC + Sunday = 11:00 Stockholm → weekly carousel
    const fireTime = new Date(event.scheduledTime);
    const hour = fireTime.getUTCHours();
    const dow = fireTime.getUTCDay();   // 0 = Sunday

    let workflow: string;
    if (hour === 9 && dow === 0) {
      workflow = "weekly-carousel-mac.yml";
    } else if (hour === 17) {
      workflow = "evening-post-mac.yml";
    } else {
      console.error(`Cron fired at unexpected time: ${hour}:00 UTC, dow=${dow}`);
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
    console.log(`Triggered ${workflow}`);
  },

  // Optional: HTTP endpoint for manual testing — `curl https://<worker>.workers.dev/?w=morning-post.yml`
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const w = url.searchParams.get("w");
    if (!w || !/^(morning|evening)-post(-mac)?\.yml$|^weekly-carousel-mac\.yml$/.test(w)) {
      return new Response("usage: ?w=morning-post-mac.yml | evening-post-mac.yml | weekly-carousel-mac.yml", { status: 400 });
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
