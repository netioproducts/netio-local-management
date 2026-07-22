import { describe, it, expect, beforeEach } from "bun:test";
import { UserService } from "../src/services/UserService";
import { ConfigService } from "../src/config/ConfigService";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function createConfigService(tempDir: string): ConfigService {
  const orig = process.env.XDG_DATA_HOME;
  process.env.XDG_DATA_HOME = tempDir;
  const svc = new ConfigService();
  if (orig === undefined) delete process.env.XDG_DATA_HOME;
  else process.env.XDG_DATA_HOME = orig;
  return svc;
}

function buildService(tempDir: string): UserService {
  const cfg = createConfigService(tempDir);
  cfg.init();

  // Inject the isolated ConfigService into UserService via a small shim
  const us = new UserService();
  (us as any).configService = cfg;
  return us;
}

// ---------------------------------------------------------------------------
// getUsers
// ---------------------------------------------------------------------------
describe("UserService – getUsers", () => {
  let tempDir: string;
  let us: UserService;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "us-test-"));
    us = buildService(tempDir);
  });

  it("returns at least one user (the default admin)", () => {
    expect(us.getUsers().length).toBeGreaterThan(0);
  });

  it("default user has a non-empty username", () => {
    expect(us.getUsers()[0].username.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// addUser
// ---------------------------------------------------------------------------
describe("UserService – addUser", () => {
  let tempDir: string;
  let us: UserService;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "us-test-"));
    us = buildService(tempDir);
  });

  it("adds a new user successfully", () => {
    us.addUser({ name: "Alice", username: "alice", password: "pass" });
    const users = us.getUsers();
    expect(users.find((u) => u.username === "alice")).toBeDefined();
  });

  it("throws when adding a user with a duplicate username", () => {
    us.addUser({ name: "Alice", username: "alice", password: "pass" });
    expect(() =>
      us.addUser({ name: "Alice2", username: "alice", password: "other" }),
    ).toThrow("User with this username already exists");
  });

  it("fires onUserUpdated callback on success", () => {
    const fired: string[] = [];
    us.on("user_updated", (name) => fired.push(name));
    us.addUser({ name: "Bob", username: "bob", password: "pw" });
    expect(fired).toContain("Bob");
  });

  it("does not fire onUserUpdated when add fails", () => {
    us.addUser({ name: "Bob", username: "bob", password: "pw" });
    const fired: string[] = [];
    us.on("user_updated", (name) => fired.push(name));
    try {
      us.addUser({ name: "Bob2", username: "bob", password: "pw" });
    } catch {}
    expect(fired).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// saveUser (upsert)
// ---------------------------------------------------------------------------
describe("UserService – saveUser", () => {
  let tempDir: string;
  let us: UserService;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "us-test-"));
    us = buildService(tempDir);
  });

  it("creates a user when none with that name exists", () => {
    us.saveUser({ name: "NewUser", username: "newuser", password: "pw" });
    expect(us.getUsers().find((u) => u.name === "NewUser")).toBeDefined();
  });

  it("overwrites an existing user with the same name", () => {
    us.saveUser({ name: "Alice", username: "alice", password: "old" });
    us.saveUser({ name: "Alice", username: "alice_new", password: "new" });
    const u = us.getUsers().find((u) => u.name === "Alice");
    expect(u?.username).toBe("alice_new");
    expect(u?.password).toBe("new");
  });

  it("fires onUserUpdated on save", () => {
    const fired: string[] = [];
    us.on("user_updated", (name) => fired.push(name));
    us.saveUser({ name: "Eve", username: "eve", password: "pw" });
    expect(fired).toContain("Eve");
  });
});

// ---------------------------------------------------------------------------
// updateUser
// ---------------------------------------------------------------------------
describe("UserService – updateUser", () => {
  let tempDir: string;
  let us: UserService;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "us-test-"));
    us = buildService(tempDir);
    us.addUser({ name: "Alice", username: "alice", password: "old" });
  });

  it("updates an existing user", () => {
    us.updateUser("Alice", {
      name: "Alice",
      username: "alice_v2",
      password: "new",
    });
    expect(us.getUsers().find((u) => u.username === "alice_v2")).toBeDefined();
  });

  it("throws when the original username is not found", () => {
    expect(() =>
      us.updateUser("nobody", { name: "X", username: "x", password: "y" }),
    ).toThrow("User not found");
  });

  it("fires onUserUpdated after a successful update", () => {
    const fired: string[] = [];
    us.on("user_updated", (name) => fired.push(name));
    us.updateUser("Alice", {
      name: "Alice",
      username: "alice_v2",
      password: "new",
    });
    expect(fired).toContain("Alice");
  });
});

// ---------------------------------------------------------------------------
// removeUser
// ---------------------------------------------------------------------------
describe("UserService – removeUser", () => {
  let tempDir: string;
  let us: UserService;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "us-test-"));
    us = buildService(tempDir);
    us.addUser({ name: "Alice", username: "alice", password: "pw" });
  });

  it("removes an existing user", () => {
    us.removeUser("Alice");
    expect(us.getUsers().find((u) => u.name === "Alice")).toBeUndefined();
  });

  it("throws when user does not exist", () => {
    expect(() => us.removeUser("Ghost")).toThrow("User not found");
  });

  it("fires onUserRemoved callback", () => {
    const removed: string[] = [];
    us.on("user_removed", (name) => removed.push(name));
    us.removeUser("Alice");
    expect(removed).toContain("Alice");
  });
});
