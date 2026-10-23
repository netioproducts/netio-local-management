import * as fs from "fs";

export const LOG_LEVELS = ["error", "warn", "info", "debug"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

const LEVEL_ORDER: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

// Values of these keys are never written to the log, not even in debug mode
const SENSITIVE_KEYS = new Set([
  "password",
  "pass",
  "token",
  "accesstoken",
  "connecttoken",
  "nltoken",
  "sessionid",
]);

const MASK = "***";
const TRIM_MARKER = "--- log trimmed ---\n";
const DEFAULT_MAX_FILE_SIZE = 5 * 1024 * 1024;

/**
 * Returns a copy of the value with sensitive keys masked. Handles circular references.
 */
export function maskSensitive(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (value instanceof Error) {
    return value;
  }
  if (seen.has(value)) {
    return "[Circular]";
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => maskSensitive(item, seen));
  }
  if (Buffer.isBuffer(value)) {
    return `[Buffer ${value.length} bytes]`;
  }

  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] = SENSITIVE_KEYS.has(key.toLowerCase())
      ? MASK
      : maskSensitive(item, seen);
  }
  return result;
}

function formatContext(context: unknown): string {
  if (context === undefined) {
    return "";
  }
  if (context instanceof Error) {
    return ` ${context.name}: ${context.message}${context.stack ? `\n${context.stack}` : ""}`;
  }
  if (typeof context === "string") {
    return ` ${context}`;
  }
  try {
    return ` ${JSON.stringify(maskSensitive(context))}`;
  } catch {
    return ` ${String(context)}`;
  }
}

export interface LogManagerOptions {
  level?: LogLevel;
  filePath?: string;
  toStdout?: boolean;
  maxFileSize?: number;
}

/**
 * Writes log records of all loggers into one file (and stdout in debug mode).
 * The file is trimmed to its newer half when it exceeds the size limit.
 */
export class LogManager {
  private _level: LogLevel = "info";
  private filePath?: string;
  private toStdout = false;
  private maxFileSize = DEFAULT_MAX_FILE_SIZE;
  private fileSize = 0;
  private fileErrorReported = false;

  public configure(options: LogManagerOptions): void {
    if (options.level) this._level = options.level;
    if (options.toStdout !== undefined) this.toStdout = options.toStdout;
    if (options.maxFileSize !== undefined) this.maxFileSize = options.maxFileSize;
    if (options.filePath !== undefined) {
      this.filePath = options.filePath;
      this.fileSize = fs.existsSync(options.filePath)
        ? fs.statSync(options.filePath).size
        : 0;
    }
  }

  public get level(): LogLevel {
    return this._level;
  }

  public get logFilePath(): string | undefined {
    return this.filePath;
  }

  public isEnabled(level: LogLevel): boolean {
    return LEVEL_ORDER[level] <= LEVEL_ORDER[this._level];
  }

  public write(
    level: LogLevel,
    module: string,
    message: string,
    context?: unknown,
  ): void {
    if (!this.isEnabled(level)) return;

    const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} [${module}] ${message}${formatContext(context)}\n`;
    this.writeLine(line);
  }

  /**
   * Writes a line regardless of the level (used for the start header).
   */
  public writeRaw(text: string): void {
    this.writeLine(text.endsWith("\n") ? text : `${text}\n`);
  }

  private writeLine(line: string): void {
    if (this.toStdout) {
      process.stdout.write(line);
    }
    if (!this.filePath) return;

    try {
      const bytes = Buffer.byteLength(line);
      if (this.fileSize + bytes > this.maxFileSize) {
        this.trimFile();
      }
      fs.appendFileSync(this.filePath, line, "utf-8");
      this.fileSize += bytes;
    } catch (error) {
      // Logging must never break the application, report the problem once
      if (!this.fileErrorReported) {
        this.fileErrorReported = true;
        process.stderr.write(`Failed to write log file ${this.filePath}: ${error}\n`);
      }
    }
  }

  /**
   * Keeps the newer half of the file, starting at a line boundary.
   */
  private trimFile(): void {
    if (!this.filePath || !fs.existsSync(this.filePath)) {
      this.fileSize = 0;
      return;
    }

    const content = fs.readFileSync(this.filePath);
    const keepFrom = Math.max(0, content.length - Math.floor(this.maxFileSize / 2));
    const newline = content.indexOf(0x0a, keepFrom);
    const kept = newline === -1 ? Buffer.alloc(0) : content.subarray(newline + 1);

    const trimmed = Buffer.concat([Buffer.from(TRIM_MARKER), kept]);
    fs.writeFileSync(this.filePath, trimmed);
    this.fileSize = trimmed.length;
  }
}

export const logManager = new LogManager();

export interface Logger {
  error(message: string, context?: unknown): void;
  warn(message: string, context?: unknown): void;
  info(message: string, context?: unknown): void;
  debug(message: string, context?: unknown): void;
  isDebugEnabled(): boolean;
}

/**
 * Creates a logger for one module, records are written through the shared LogManager.
 */
export function createLogger(module: string, manager: LogManager = logManager): Logger {
  return {
    error: (message, context) => manager.write("error", module, message, context),
    warn: (message, context) => manager.write("warn", module, message, context),
    info: (message, context) => manager.write("info", module, message, context),
    debug: (message, context) => manager.write("debug", module, message, context),
    isDebugEnabled: () => manager.isEnabled("debug"),
  };
}

export type LogLevelSource = "env" | "config" | "default";

/**
 * Effective log level: NETIO_DEBUG env variable, then settings.logLevel from config, then info.
 */
export function resolveLogLevel(
  env: Record<string, string | undefined>,
  configLevel: LogLevel | undefined,
): { level: LogLevel; source: LogLevelSource } {
  const debugEnv = env.NETIO_DEBUG?.toLowerCase();
  if (debugEnv === "1" || debugEnv === "true") {
    return { level: "debug", source: "env" };
  }
  if (configLevel) {
    return { level: configLevel, source: "config" };
  }
  return { level: "info", source: "default" };
}
