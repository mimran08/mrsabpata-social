#!/usr/bin/env tsx
import { generatePostImage } from "./utils/image-gen.js";

const posts = [
  { filename: "2026-05-13-morning", pillar: "Jobs & Career in Sweden",   stat: "Tell Me About a Time...", subtext: "Swedish competency interview format" },
  { filename: "2026-05-13-evening", pillar: "Real Immigrant Stories",     stat: "Weeks 5–8",              subtext: "The loneliness nobody warns you about" },
  { filename: "2026-05-14-morning", pillar: "Work & Visa in Sweden",      stat: "SFI is FREE",            subtext: "Free Swedish classes for immigrants" },
  { filename: "2026-05-14-evening", pillar: "Faith & Life in Sweden",     stat: "19-Hour Fast",           subtext: "Ramadan in Swedish summer" },
  { filename: "2026-05-15-morning", pillar: "Jobs & Career in Sweden",    stat: "Fix Your LinkedIn",      subtext: "Swedish recruiters are watching" },
  { filename: "2026-05-15-evening", pillar: "Real Immigrant Stories",     stat: "10+ Year Queue",         subtext: "Stockholm housing reality" },
  { filename: "2026-05-16-morning", pillar: "Work & Visa in Sweden",      stat: "No Personnummer",        subtext: "No bank. No SFI. No healthcare." },
  { filename: "2026-05-16-evening", pillar: "Faith & Life in Sweden",     stat: "Nobody is Watching",     subtext: "Ramadan clarity in Sweden" },
  { filename: "2026-05-17-morning", pillar: "Jobs & Career in Sweden",    stat: "Swedish = Advantage",    subtext: "No longer optional for jobs" },
  { filename: "2026-05-17-evening", pillar: "Real Immigrant Stories",     stat: "8:57 or Late",           subtext: "Sweden's punctuality culture" },
  { filename: "2026-05-18-morning", pillar: "Work & Visa in Sweden",      stat: "Citizenship Test 2026",  subtext: "August launch — what to expect" },
  { filename: "2026-05-18-evening", pillar: "Faith & Life in Sweden",     stat: "Fajr Walk",              subtext: "The anchor that helped me settle" },
  { filename: "2026-05-19-morning", pillar: "Jobs & Career in Sweden",    stat: "Free IT Education",      subtext: "Komvux changes everything" },
  { filename: "2026-05-19-evening", pillar: "Real Immigrant Stories",     stat: "40,000+ Pakistanis",     subtext: "in Sweden — underrated network" },
  { filename: "2026-05-20-morning", pillar: "Work & Visa in Sweden",      stat: "Don't Miss This",        subtext: "Health insurance for short permits" },
  { filename: "2026-05-20-evening", pillar: "Faith & Life in Sweden",     stat: "Your Iman is Protected", subtext: "Faith in secular Sweden" },
  { filename: "2026-05-21-morning", pillar: "Jobs & Career in Sweden",    stat: "Job First. Then Visa.",  subtext: "The correct sequence for Sweden" },
  { filename: "2026-05-21-evening", pillar: "Real Immigrant Stories",     stat: "They Will Respond",      subtext: "Give Swedes time — they warm up" },
  { filename: "2026-05-22-evening", pillar: "Faith & Life in Sweden",     stat: "What I Wish I Knew",     subtext: "Before leaving Pakistan" },
  { filename: "2026-05-23-evening", pillar: "Real Immigrant Stories",     stat: "Swedes Are Direct",      subtext: "Swedish workplace feedback" },
  { filename: "2026-05-24-evening", pillar: "Faith & Life in Sweden",     stat: "Nature is FREE",         subtext: "Sweden's most underrated thing" },
  { filename: "2026-05-25-evening", pillar: "Real Immigrant Stories",     stat: "No Bank? No Problem.",   subtext: "Wise or Revolut before personnummer" },
  { filename: "2026-05-26-evening", pillar: "Faith & Life in Sweden",     stat: "Maghrib at 3 PM",        subtext: "Winter Ramadan in Sweden" },
];

async function main() {
  let ok = 0, fail = 0;
  for (const p of posts) {
    try {
      await generatePostImage({ stat: p.stat, subtext: p.subtext, pillar: p.pillar, filename: p.filename });
      console.log("✅", p.filename);
      ok++;
    } catch (e) {
      console.error("❌", p.filename, (e as Error).message);
      fail++;
    }
  }
  console.log(`\nDone: ${ok} ✅  ${fail} ❌`);
}

main().catch(e => { console.error(e); process.exit(1); });
