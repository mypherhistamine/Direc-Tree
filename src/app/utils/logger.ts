/**
 * Frontend structured logger with ring-buffer storage.
 *
 * Usage:
 *   import { log } from "@/app/utils/logger";
 *   log.info("tree expanded", { dn: "ou=People,dc=example,dc=com" });
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  ts: string;        // ISO-8601
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const MAX_ENTRIES = 2000;

class Logger {
  private buffer: LogEntry[] = [];
  private minLevel: LogLevel = "debug";

  /** Replace the minimum level at runtime */
  setLevel(level: LogLevel) {
    this.minLevel = level;
  }

  /** Core writer */
  private write(level: LogLevel, message: string, context?: Record<string, unknown>) {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.minLevel]) return;

    const entry: LogEntry = {
      ts: new Date().toISOString(),
      level,
      message,
      ...(context && Object.keys(context).length > 0 ? { context } : {}),
    };

    this.buffer.push(entry);
    // Trim ring buffer
    if (this.buffer.length > MAX_ENTRIES) {
      this.buffer = this.buffer.slice(this.buffer.length - MAX_ENTRIES);
    }

    // Also mirror to devtools console in dev builds
    if (process.env.NODE_ENV === "development") {
      const fn = level === "error" ? console.error
        : level === "warn" ? console.warn
        : level === "debug" ? console.debug
        : console.log;
      fn(`[${level.toUpperCase()}] ${message}`, context ?? "");
    }
  }

  debug(message: string, context?: Record<string, unknown>) { this.write("debug", message, context); }
  info(message: string, context?: Record<string, unknown>) { this.write("info", message, context); }
  warn(message: string, context?: Record<string, unknown>) { this.write("warn", message, context); }
  error(message: string, context?: Record<string, unknown>) { this.write("error", message, context); }

  /** Return all entries (newest last) */
  getEntries(): LogEntry[] {
    return [...this.buffer];
  }

  /** Return entries matching an optional level filter and/or search string */
  query(opts?: { level?: LogLevel; search?: string }): LogEntry[] {
    let result = this.buffer;
    if (opts?.level) {
      const minP = LEVEL_PRIORITY[opts.level];
      result = result.filter((e) => LEVEL_PRIORITY[e.level] >= minP);
    }
    if (opts?.search) {
      const q = opts.search.toLowerCase();
      result = result.filter(
        (e) =>
          e.message.toLowerCase().includes(q) ||
          (e.context && JSON.stringify(e.context).toLowerCase().includes(q))
      );
    }
    return [...result];
  }

  /** Export buffer as JSON string */
  exportJSON(): string {
    return JSON.stringify(this.buffer, null, 2);
  }

  /** Export buffer as plain text lines */
  exportText(): string {
    return this.buffer
      .map((e) => {
        const ctx = e.context ? " " + JSON.stringify(e.context) : "";
        return `${e.ts} [${e.level.toUpperCase().padEnd(5)}] ${e.message}${ctx}`;
      })
      .join("\n");
  }

  /** Clear the buffer */
  clear() {
    this.buffer = [];
  }

  /** Number of stored entries */
  get size(): number {
    return this.buffer.length;
  }
}

/** Singleton logger instance */
export const log = new Logger();
