import * as fs from "node:fs/promises";
import * as path from "node:path";
import { BrainError } from "../utils/errors.js";

const BRAIN_PATH = path.join("company", "brain.json");

export async function readBrain(): Promise<Record<string, unknown>> {
  try {
    const raw = await fs.readFile(BRAIN_PATH, "utf-8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new BrainError("Failed to read brain.json — file missing or corrupt");
  }
}

export async function writeBrain(updates: Record<string, unknown>): Promise<void> {
  const brain = await readBrain();
  const merged = deepMerge(brain, updates);
  merged.last_updated = new Date().toISOString().split("T")[0];
  await fs.writeFile(BRAIN_PATH, JSON.stringify(merged, null, 2), "utf-8");
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const sv = source[key];
    const tv = target[key];
    if (sv && typeof sv === "object" && !Array.isArray(sv) && tv && typeof tv === "object" && !Array.isArray(tv)) {
      result[key] = deepMerge(tv as Record<string, unknown>, sv as Record<string, unknown>);
    } else {
      result[key] = sv;
    }
  }
  return result;
}
