export type LogLevel = "error" | "warn" | "info" | "debug";

// Frontend writes to the console only in debug mode, the level comes from the backend
let consoleEnabled = false;

// Values of these keys are never printed, not even in debug mode (same list as in the backend)
const SENSITIVE_KEYS = new Set([
  "password",
  "pass",
  "token",
  "accesstoken",
  "connecttoken",
  "nltoken",
  "sessionid",
]);

const maskSensitive = (value: unknown, seen = new WeakSet<object>()): unknown => {
  if (value === null || typeof value !== "object" || value instanceof Error) {
    return value;
  }
  if (seen.has(value)) return "[Circular]";
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => maskSensitive(item, seen));
  }
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? "***" : maskSensitive(item, seen);
  }
  return result;
};

export const configureLogger = (level: LogLevel): void => {
  consoleEnabled = level === "debug";
};

export interface Logger {
  error(message: string, ...context: unknown[]): void;
  warn(message: string, ...context: unknown[]): void;
  info(message: string, ...context: unknown[]): void;
  debug(message: string, ...context: unknown[]): void;
}

/**
 * Creates a console logger for one module. Nothing is printed unless debug mode is on.
 */
export const createLogger = (module: string): Logger => {
  const write =
    (level: LogLevel) =>
    (message: string, ...context: unknown[]) => {
      if (!consoleEnabled) return;
      console[level](`[${module}] ${message}`, ...context.map((c) => maskSensitive(c)));
    };

  return {
    error: write("error"),
    warn: write("warn"),
    info: write("info"),
    debug: write("debug"),
  };
};
