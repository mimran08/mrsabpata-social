const TIMEZONE = "Europe/Stockholm";

export function nowInStockholm(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: TIMEZONE }));
}

export function toStockholmISOString(date?: Date): string {
  const d = date ?? new Date();
  return d.toLocaleString("sv-SE", { timeZone: TIMEZONE }).replace(" ", "T");
}

export function isOptimalYouTubePublishTime(): boolean {
  const now = nowInStockholm();
  const hour = now.getHours();
  const day = now.getDay(); // 0=Sun, 2=Tue, 4=Thu
  const isGoodDay = day === 2 || day === 4;
  const isGoodHour = hour >= 17 && hour <= 19;
  return isGoodDay && isGoodHour;
}

export function nextOptimalPublishTime(): Date {
  const now = nowInStockholm();
  const candidate = new Date(now);
  candidate.setHours(17, 0, 0, 0);

  for (let i = 0; i < 14; i++) {
    const day = candidate.getDay();
    if ((day === 2 || day === 4) && candidate > now) return candidate;
    candidate.setDate(candidate.getDate() + 1);
  }

  return candidate;
}

export function dateString(date?: Date): string {
  return (date ?? nowInStockholm()).toISOString().split("T")[0];
}
