import { EventEmitter } from "events";
import { User } from "../config/ConfigModel";
import { ConfigService } from "../config/ConfigService";
import { createLogger } from "../logging/Logger";

const log = createLogger("UserService");

export class UserService extends EventEmitter {
  private configService: ConfigService;

  constructor(configService: ConfigService) {
    super();
    this.configService = configService;
  }

  // helper metods
  private getUser(name: string): User {
    const user = this.configService.getUser(name);
    if (!user) {
      log.debug("User not found", { user: name });
      throw new Error(`User not found`);
    }
    return user;
  }

  public getUsers(): User[] {
    return this.configService.getUsers();
  }

  public saveUser(user: User): void {
    this.configService.addOrUpdateUser(user.name, user.username, user.password);
    log.info("User saved", { user: user.name, username: user.username });
    this.emit("user_updated", user.name);
  }

  public addUser(user: User): void {
    const users = this.configService.getUsers();
    if (users.find((u) => u.username === user.username)) {
      log.warn("User not added, username already exists", {
        user: user.name,
        username: user.username,
      });
      throw new Error("User with this username already exists");
    }
    this.configService.addOrUpdateUser(user.name, user.username, user.password);
    log.info("User added", { user: user.name, username: user.username });
    this.emit("user_updated", user.name);
  }

  public updateUser(name: string, updatedUser: User): void {
    this.getUser(name); // Ensure user exists
    this.configService.addOrUpdateUser(
      name,
      updatedUser.username,
      updatedUser.password,
    );
    log.info("User credentials updated", {
      user: name,
      username: updatedUser.username,
    });
    this.emit("user_updated", name);
  }

  public removeUser(name: string): void {
    this.getUser(name); // Ensure user exists
    this.emit("user_removed", name);
    this.configService.removeUser(name);
    log.info("User removed", { user: name });
  }
}
