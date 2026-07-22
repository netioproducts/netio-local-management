import { User } from "../models/User";
import { broadcastRaw, request } from "./neutralinoTransport";

const getUsers = (): Promise<User[]> => {
  return request("getUsers");
};

const saveUser = (user: User): Promise<void> => {
  return request("saveUser", user);
};

const removeUser = (name: string): Promise<void> => {
  return request("removeUser", { name });
};

const exitApp = (): Promise<void> => {
  return broadcastRaw("windowClose");
};

export const appService = {
  getUsers,
  saveUser,
  removeUser,
  exitApp,
};
