import { readBrain, writeBrain } from "../company/brain.js";
import { fileMemo } from "../company/memos.js";
import { logAction } from "../utils/logger.js";
import { dateString } from "../utils/time.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";

const ROLE = "analyst";

export interface PerformanceReport {
  videoTitle: string;
  publishedDate: string;
  reportDate: string;
  ctr: number;
  avgViewDurationSeconds: number;
  views48h: number;
  returnViewersPct: number;
  impressions: number;
  firstThirtySecDropPct: number;
  biggestDropTimestamp: string;
  completionRatePct: number;
  dominantCommentFeeling: string;
  topQuestionAsked: string;
  diagnosis: string;
  keyLearning: string;
  nextVideoRecommendation: string;
  verdict: "Strong" | "Needs improvement" | "Concerning";
}

export async function run48HourAudit(videoTitle: string, metrics: Partial<PerformanceReport>): Promise<PerformanceReport> {
  logAction(ROLE, `Running 48hr audit: "${videoTitle}"`);

  const report: PerformanceReport = {
    videoTitle,
    publishedDate: metrics.publishedDate ?? "",
    reportDate: dateString(),
    ctr: metrics.ctr ?? 0,
    avgViewDurationSeconds: metrics.avgViewDurationSeconds ?? 0,
    views48h: metrics.views48h ?? 0,
    returnViewersPct: metrics.returnViewersPct ?? 0,
    impressions: metrics.impressions ?? 0,
    firstThirtySecDropPct: metrics.firstThirtySecDropPct ?? 0,
    biggestDropTimestamp: metrics.biggestDropTimestamp ?? "",
    completionRatePct: metrics.completionRatePct ?? 0,
    dominantCommentFeeling: metrics.dominantCommentFeeling ?? "",
    topQuestionAsked: metrics.topQuestionAsked ?? "",
    diagnosis: diagnose(metrics),
    keyLearning: "",
    nextVideoRecommendation: "",
    verdict: verdict(metrics),
  };

  const filename = `${report.reportDate}-audit-${videoTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.md`;
  await fs.writeFile(path.join("company/analytics", filename), formatReport(report), "utf-8");

  await writeBrain({
    last_performance_audit: {
      date: report.reportDate,
      video_title: videoTitle,
      ctr: report.ctr,
      avg_view_duration: `${Math.floor(report.avgViewDurationSeconds / 60)}:${String(report.avgViewDurationSeconds % 60).padStart(2, "0")}`,
      return_viewers_pct: report.returnViewersPct,
      diagnosis: report.diagnosis,
      next_action: report.nextVideoRecommendation,
    },
  });

  await fileMemo({
    from: ROLE,
    to: "ceo",
    date: report.reportDate,
    subject: `48hr Audit: ${videoTitle} — ${report.verdict}`,
    body: `Report at company/analytics/${filename}\n\nDiagnosis: ${report.diagnosis}\nNext rec: ${report.nextVideoRecommendation}`,
    actionRequired: report.verdict !== "Strong",
  });

  logAction(ROLE, `Audit complete — verdict: ${report.verdict}`);
  return report;
}

function diagnose(m: Partial<PerformanceReport>): string {
  const issues: string[] = [];

  if (m.ctr !== undefined && m.ctr < 4) issues.push("CTR < 4% — thumbnail or title problem");
  if (m.avgViewDurationSeconds !== undefined && m.avgViewDurationSeconds < 60) issues.push("Avg duration < 1 min — hook not delivering on title promise");
  if (m.avgViewDurationSeconds !== undefined && m.avgViewDurationSeconds < 120 && m.avgViewDurationSeconds >= 60) issues.push("Drop likely in context bridge — too slow, cut by half");
  if (m.returnViewersPct !== undefined && m.returnViewersPct < 5) issues.push("Return viewers < 5% — end-of-video tease not creating FOMO");

  return issues.length > 0 ? issues.join(". ") : "Performing within expected range.";
}

function verdict(m: Partial<PerformanceReport>): "Strong" | "Needs improvement" | "Concerning" {
  const ctrOk = (m.ctr ?? 0) >= 6;
  const durOk = (m.avgViewDurationSeconds ?? 0) >= 180;
  const returnOk = (m.returnViewersPct ?? 0) >= 10;

  const passing = [ctrOk, durOk, returnOk].filter(Boolean).length;
  if (passing === 3) return "Strong";
  if (passing >= 1) return "Needs improvement";
  return "Concerning";
}

function formatReport(r: PerformanceReport): string {
  const dur = `${Math.floor(r.avgViewDurationSeconds / 60)}:${String(r.avgViewDurationSeconds % 60).padStart(2, "0")}`;
  return `# 48-Hour Audit: ${r.videoTitle}

**Published:** ${r.publishedDate}
**Report Date:** ${r.reportDate}
**Verdict:** ${r.verdict}

## Metrics

| Metric | Value | Target | Status |
|---|---|---|---|
| CTR | ${r.ctr}% | 6-10% | ${r.ctr >= 6 ? "pass" : "fail"} |
| Avg View Duration | ${dur} | 3:00+ | ${r.avgViewDurationSeconds >= 180 ? "pass" : "fail"} |
| Views (48hr) | ${r.views48h} | — | — |
| Return Viewers | ${r.returnViewersPct}% | 15%+ | ${r.returnViewersPct >= 15 ? "pass" : "fail"} |
| Completion Rate | ${r.completionRatePct}% | — | — |

## Retention Analysis

- First 30 sec drop: ${r.firstThirtySecDropPct}% left
- Biggest drop: ${r.biggestDropTimestamp}
- Dominant comment feeling: ${r.dominantCommentFeeling}
- Top question asked: ${r.topQuestionAsked}

## Diagnosis

${r.diagnosis}

## Key Learning

${r.keyLearning || "[To be completed after reviewing retention graph]"}

## Next Video Recommendation

${r.nextVideoRecommendation || "[Based on this data — what to make next and why]"}
`;
}
