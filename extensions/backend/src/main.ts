import * as os from "os";
import * as path from "path";
import { ConfigService } from "./config/ConfigService";
import { TransportService } from "./transport/TransportService";
import { DeviceManager } from "./services/DeviceManager";
import { DeviceService } from "./services/DeviceService";
import { UserService } from "./services/UserService";
import { GroupService } from "./services/GroupService";
import { createRoutes, READ_ONLY_ROUTES } from "./transport/routes";
import { DeviceEventService } from "./services/DeviceEventService";
import { DeviceControlService } from "./services/DeviceControlService";
import { DeviceDiscoveryService } from "./services/DeviceDiscoveryService";
import { DeviceFileService } from "./services/DeviceFileService";

import { ESPDevice } from "./netio-api/devices/ESPDevice";
import { createLogger, logManager, resolveLogLevel } from "./logging/Logger";

// Version of the whole application, bundled into the binary at build time
const APP_VERSION: string = require("../../../package.json").version;

const log = createLogger("App");

const configService = new ConfigService();

// Log next to data.json, level from env until the config is loaded
const startupLevel = resolveLogLevel(process.env, undefined);
logManager.configure({
  filePath: path.join(configService.getConfigDir(), "backend.log"),
  level: startupLevel.level,
  toStdout: startupLevel.level === "debug",
});
logManager.writeRaw(
  `===== Netio Local Management ${APP_VERSION} started ${new Date().toISOString()} =====`,
);
log.info(
  `Platform ${process.platform} ${process.arch} (${os.release()}), pid ${process.pid}`,
);
log.info(`Data directory: ${configService.getConfigDir()}`);
log.info(`Log file: ${logManager.logFilePath}`);

process.on("uncaughtException", (error) => {
  log.error("Uncaught exception", error);
});
process.on("unhandledRejection", (reason) => {
  log.error("Unhandled promise rejection", reason);
});

const clientFactory = (
  ip: string,
  mac: string,
  user: string,
  pass: string,
  fw?: string,
) => {
  return new ESPDevice({
    ipAddress: ip,
    macAddress: mac,
    username: user,
    password: pass,
    fwVersion: fw,
  });
};
const deviceManager = new DeviceManager(clientFactory);

const transportService = new TransportService(configService);

const deviceEventService = new DeviceEventService(
  transportService,
  deviceManager,
);
const deviceControlService = new DeviceControlService(
  deviceManager,
  deviceEventService,
);
const deviceDiscoveryService = new DeviceDiscoveryService(
  deviceManager,
  configService,
);
const deviceFileService = new DeviceFileService(
  deviceManager,
  configService,
  transportService,
);

const deviceService = new DeviceService(
  configService,
  deviceManager,
  deviceEventService,
  deviceControlService,
  deviceDiscoveryService,
);
const userService = new UserService(configService);
const groupService = new GroupService(configService);

const reportBackgroundError = (error: unknown) => {
  log.error("Background operation failed", error);
  transportService.broadcastError(
    error instanceof Error ? error.message : String(error),
  );
};

userService.on("user_updated", (userName) => {
  deviceService.updateCredentialsForUser(userName).catch(reportBackgroundError);
});
userService.on("user_removed", (userName) => {
  deviceService.clearCredentialsForUser(userName).catch(reportBackgroundError);
});

// Start functions
const routes = createRoutes(
  deviceService,
  userService,
  groupService,
  deviceControlService,
  deviceDiscoveryService,
  deviceFileService,
  deviceEventService,
);
transportService.registerRoutes(routes, READ_ONLY_ROUTES);

configService.warningBroadcast =
  transportService.broadcastWarning.bind(transportService);
deviceService.errorBroadcast =
  transportService.broadcastError.bind(transportService);
configService.init();

const logLevel = resolveLogLevel(process.env, configService.getSettings().logLevel);
logManager.configure({
  level: logLevel.level,
  toStdout: logLevel.level === "debug",
});
log.info(`Log level: ${logLevel.level} (source: ${logLevel.source})`);

deviceService.start();
transportService.start();
