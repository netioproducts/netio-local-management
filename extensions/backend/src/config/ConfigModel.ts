import { z } from "zod";
import { LOG_LEVELS } from "../logging/Logger";

const MACAddressRegex = z
  .string()
  .regex(
    /^([0-9A-Fa-f]{2}[:-]?){5}([0-9A-Fa-f]{2})$/,
    "Invalid MAC address format",
  )
  .transform((mac) => mac.toLowerCase().replace(/[:-]/g, ""));

const DeviceSchema = z.object({
  macAddress: MACAddressRegex,
  ipAddress: z.ipv4(),
  fwVersion: z.string().min(1).optional(),
  name: z.string().optional(),
  model: z.string().optional(),
  sockets: z.array(z.string()).optional(), // Socket name array

  user: z.string().optional(), // User name from UserSchema
});

const UserSchema = z.object({
  name: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
});

const DeviceGroupSchema = z.object({
  name: z.string(),
  devices: z.array(MACAddressRegex), // Array of device MAC addresses
});

const SocketGroupSchema = z.object({
  name: z.string(),
  sockets: z.array(
    z.tuple([MACAddressRegex, z.number().min(0)]), // Tuple [deviceMacAddress, socketIndex]
  ),
});

// Application settings, every field is optional and validated separately
const SettingsSchema = z.object({
  logLevel: z.enum(LOG_LEVELS).optional(),
});

export const AppConfigSchema = z.object({
  devices: z.array(DeviceSchema),
  deviceGroups: z.array(DeviceGroupSchema),
  // socketGroups: z.array(SocketGroupSchema),
  users: z.array(UserSchema),
  settings: SettingsSchema.optional(),
});

export type Device = z.infer<typeof DeviceSchema>;
export type DeviceGroup = z.infer<typeof DeviceGroupSchema>;
export type SocketGroup = z.infer<typeof SocketGroupSchema>;
export type User = z.infer<typeof UserSchema>;
export type Settings = z.infer<typeof SettingsSchema>;
export type AppConfig = z.infer<typeof AppConfigSchema>;

// Default configuration
export const DEFAULT_CONFIG: AppConfig = {
  devices: [],
  deviceGroups: [],
  // socketGroups: [],
  users: [
    {
      name: "Default",
      username: "admin",
      password: "admin",
    },
  ],
};

export function createDefaultConfig(): AppConfig {
  return structuredClone(DEFAULT_CONFIG);
}

// --- Lenient parsing ---

const RawAppConfigSchema = z.object({
  devices: z.array(z.unknown()),
  deviceGroups: z.array(z.unknown()),
  users: z.array(z.unknown()),
  settings: z.unknown().optional(),
});

const RawDeviceGroupSchema = z.object({
  name: z.string(),
  devices: z.array(z.unknown()),
});

export interface ParsedAppConfig {
  config: AppConfig;
  issues: string[]; // Human readable descriptions of dropped entries
}

function formatIssues(prefix: string, error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path
      .map((segment) =>
        typeof segment === "number" ? `[${segment}]` : `.${String(segment)}`,
      )
      .join("");
    return `${prefix}${path}: ${issue.message}`;
  });
}

function parseEntries<T>(
  name: string,
  entries: unknown[],
  schema: z.ZodType<T>,
  issues: string[],
): T[] {
  return entries.flatMap((entry, idx) => {
    const result = schema.safeParse(entry);
    if (!result.success) {
      issues.push(...formatIssues(`${name}[${idx}]`, result.error));
      return [];
    }
    return [result.data];
  });
}

/**
 * Parses configuration loaded from disk. Throws when the top-level structure is broken,
 * invalid devices, users and groups are dropped, invalid MACs are dropped from groups.
 */
export function parseAppConfig(raw: unknown): ParsedAppConfig {
  const parsed = RawAppConfigSchema.parse(raw);
  const issues: string[] = [];

  const devices = parseEntries("devices", parsed.devices, DeviceSchema, issues);
  const users = parseEntries("users", parsed.users, UserSchema, issues);
  const deviceGroups = parsed.deviceGroups.flatMap((entry, groupIdx) => {
    const result = RawDeviceGroupSchema.safeParse(entry);
    if (!result.success) {
      issues.push(...formatIssues(`deviceGroups[${groupIdx}]`, result.error));
      return [];
    }
    return [
      {
        name: result.data.name,
        devices: parseEntries(
          `deviceGroups[${groupIdx}].devices`,
          result.data.devices,
          MACAddressRegex,
          issues,
        ),
      },
    ];
  });

  const settings = parseSettings(parsed.settings, issues);

  return {
    config: { devices, deviceGroups, users, ...(settings && { settings }) },
    issues,
  };
}

/**
 * Keeps valid settings fields, invalid ones are dropped and reported.
 */
function parseSettings(raw: unknown, issues: string[]): Settings | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    issues.push("settings: Expected an object");
    return undefined;
  }

  const settings: Settings = {};
  for (const [key, fieldSchema] of Object.entries(SettingsSchema.shape)) {
    const value = (raw as Record<string, unknown>)[key];
    if (value === undefined) continue;
    const result = fieldSchema.safeParse(value);
    if (result.success) {
      (settings as Record<string, unknown>)[key] = result.data;
    } else {
      issues.push(...formatIssues(`settings.${key}`, result.error));
    }
  }
  return settings;
}
