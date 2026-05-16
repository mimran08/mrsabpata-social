import * as fs from "node:fs/promises";
import * as path from "node:path";
import { dateString } from "../utils/time.js";

export interface ImranBrief {
  subject: string;
  what: string;
  why: string;
  steps: string[];
  timeNeeded: string;
  deadline: string;
}

export async function fileImranInbox(brief: ImranBrief): Promise<void> {
  const today = dateString();
  const slug = brief.subject.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
  const filename = `${today}-${slug}.md`;

  const content = `# ATTENTION: IMRAN

**From:** CEO, MrSabPata Media Company
**Date:** ${today}
**Subject:** ${brief.subject}

---

**WHAT'S NEEDED:**
${brief.what}

**WHY ONLY YOU:**
${brief.why}

**WHAT TO DO:**
${brief.steps.join("\n")}

**TIME NEEDED:** ${brief.timeNeeded}

**DEADLINE:** ${brief.deadline}
`;

  await fs.writeFile(path.join("company/imran-inbox", filename), content, "utf-8");
}
