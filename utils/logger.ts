export type LogLevel = "info" | "warn" | "error" | "action";

export interface LogEntry {
  timestamp: string;
  role: string;
  level: LogLevel;
  message: string;
}

export function log(role: string, level: LogLevel, message: string): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    role,
    level,
    message,
  };
  const prefix = `[${entry.timestamp}] [${role.toUpperCase()}] [${level.toUpperCase()}]`;
  console.log(`${prefix} ${message}`);
}

export function logAction(role: string, action: string): void {
  log(role, "action", action);
}
