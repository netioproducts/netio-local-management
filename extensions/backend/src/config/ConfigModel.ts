import { z } from "zod";

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

export const AppConfigSchema = z.object({
  devices: z.array(DeviceSchema),
  deviceGroups: z.array(DeviceGroupSchema),
  // socketGroups: z.array(SocketGroupSchema),
  users: z.array(UserSchema),
});

export type Device = z.infer<typeof DeviceSchema>;
export type DeviceGroup = z.infer<typeof DeviceGroupSchema>;
export type SocketGroup = z.infer<typeof SocketGroupSchema>;
export type User = z.infer<typeof UserSchema>;
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
