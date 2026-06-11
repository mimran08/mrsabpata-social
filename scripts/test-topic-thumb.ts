// Smoke test the new topic-specific thumbnail generator against an existing
// rendered comic panel from yesterday's evening cron.
import { generateTopicThumbnail } from "../utils/image-gen.js";

async function main() {
  const out = await generateTopicThumbnail({
    panelPath: "/Users/imran/actions-runner/_work/mrsabpata-social/mrsabpata-social/company/characters/scenes/2026-06-10-evening/panel-01.png",
    stat: "Bilal bhai, what do I do?",
    subtext: "11pm. The email arrives.",
    pillar: "Sweden Visa & Immigration",
    filename: "topic-thumb-test",
    outDir: "logs",
  });
  console.log("→", out);
}
void main();
