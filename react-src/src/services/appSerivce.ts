import { User } from "../models/User";
import { broadcastRaw, request } from "./neutralinoTransport";
import { LogLevel } from "./logger";

const getUsers = (): Promise<User[]> => {
  return request("getUsers");
};

const saveUser = (user: User): Promise<void> => {
  return request("saveUser", user);
};

const removeUser = (name: string): Promise<void> => {
  return request("removeUser", { name });
};

const getLogLevel = (): Promise<{ logLevel: LogLevel }> => {
  return request("getLogLevel");
};

const exitApp = (): Promise<void> => {
  return broadcastRaw("windowClose");
};

export const appService = {
  getUsers,
  saveUser,
  removeUser,
  getLogLevel,
  exitApp,
};
