import { ConfigService } from "./config/ConfigService";
import { TransportService } from "./transport/TransportService";
import { DeviceManager } from "./services/DeviceManager";
import { DeviceService } from "./services/DeviceService";
import { UserService } from "./services/UserService";
import { GroupService } from "./services/GroupService";
import { createRoutes } from "./transport/routes";
import { DeviceEventService } from "./services/DeviceEventService";
import { DeviceControlService } from "./services/DeviceControlService";
import { DeviceDiscoveryService } from "./services/DeviceDiscoveryService";
import { DeviceFileService } from "./services/DeviceFileService";

import { ESPDevice } from "./netio-api/devices/ESPDevice";

const configService = new ConfigService();

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

const transportService = new TransportService(configService, true); // true = debug mode

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

userService.on("user_updated", (userName) => {
  deviceService.updateCredentialsForUser(userName).catch();
});
userService.on("user_removed", (userName) => {
  deviceService.clearCredentialsForUser(userName).catch();
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
transportService.registerRoutes(routes);

configService.warningBroadcast =
  transportService.broadcastWarning.bind(transportService);
deviceService.errorBroadcast =
  transportService.broadcastError.bind(transportService);
configService.init();

deviceService.start();
transportService.start();
