import * as fs from "node:fs/promises";
import * as path from "node:path";

export interface Memo {
  from: string;
  to: string;
  date: string;
  subject: string;
  body: string;
  actionRequired: boolean;
}

export async function fileMemo(memo: Memo): Promise<void> {
  const filename = `${memo.date}-${memo.from}-to-${memo.to}-${memo.subject
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 40)}.md`;

  const content = `# INTERNAL MEMO

**From:** ${memo.from}
**To:** ${memo.to}
**Date:** ${memo.date}
**Re:** ${memo.subject}

---

${memo.body}

**Action Required:** ${memo.actionRequired ? "Yes" : "No"}
`;

  await fs.writeFile(path.join("company/memos", filename), content, "utf-8");
}
