import React, { useCallback } from "react";
import { useEffect } from "react";
import { useParams } from "react-router";
import { Device } from "../../models/Device";
import Container from "react-bootstrap/esm/Container";
import { handleLoadingAction } from "../../utils/asyncUtils";
import { deviceService } from "../../services/deviceService";
import { notify, notifyError } from "../../services/notificationService";
import LoginOverlay from "../../components/DeviceCard/LoginOverlay";
import { User } from "../../models/User";
import { appService } from "../../services/appSerivce";
import { SocketSwitch } from "../../components/DeviceCard/DeviceCard";
import { Badge, Button, Card, Col, Placeholder, Row } from "react-bootstrap";
import { IconButton } from "../../components/IconButton";
import { MdOutlineEdit } from "react-icons/md";
import { os } from "@neutralinojs/lib";
import { DeviceInfoPanel } from "./DeviceInfoPanel";
import { FirmwareUploadModal } from "../../components/FirmwareUploadModal";
import { ConfigManagementModal } from "../../components/ConfigManagementModal";
import { DeviceSettingsModal } from "../../components/DeviceSettingsModal";
import { FiSettings } from "react-icons/fi";
import "./DeviceView.css";
import { eventService } from "../../services/eventService";
import { DeviceStatusDTO } from "../../models/DeviceUpdate";
import {
  applyDeviceBusyUpdate,
  applyDeviceStatusUpdate,
  mergeDeviceWithSocketPreserve,
  normalizeMac,
} from "../../utils/deviceStateUtils";
import { IoMdRefresh } from "react-icons/io";

export const DeviceView = () => {
  const { deviceId } = useParams<{ deviceId: string }>();
  const [device, setDevice] = React.useState<Device | null>(null);
  const [info, setInfo] = React.useState<any>(null);
  const [users, setUsers] = React.useState<User[]>([]);
  const [isPending, setIsPending] = React.useState(false);
  const [isLoadingDevice, setIsLoadingDevice] = React.useState(true);
  const [isLoadingDetails, setIsLoadingDetails] = React.useState(false);
  const [updateModalOpen, setUpdateModalOpen] = React.useState(false);
  const [configModalOpen, setConfigModalOpen] = React.useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = React.useState(false);

  const getUsers = useCallback(async () => {
    await handleLoadingAction<User[]>({
      setLoading: setIsPending,
      onLoaded: setUsers,
      onError: (err) => notifyError("Failed to load users", err),
    }, () => appService.getUsers()).catch(() => { });
  }, []);

  const getAllDetails = useCallback(async (id: string) => {
    console.debug(`Loading all details for device ${id}...`);
    await handleLoadingAction<any>({
      setLoading: setIsLoadingDetails,
      onLoaded: (deviceInfo) => {
        setInfo(deviceInfo);
        console.log("Device info loaded:", deviceInfo);
      },
      onError: (err) => notifyError(`Failed to load device details: ${id}`, err),
    }, () => deviceService.getDeviceDetails(id)).catch(() => { });
  }, []);

  const getDeviceDetails = useCallback(async (id: string) => {
    console.debug(`Loading details for device ${id}...`);
    await handleLoadingAction<Device>({
      setLoading: setIsLoadingDevice,
      onLoaded: async (device) => {
        setDevice(device);
        await getAllDetails(id);
        if (device.isOnline) {
          await getUsers();
        }
      },
      onError: (err) => notifyError(`Failed to load device: ${id}`, err),
    }, () => deviceService.getDevice(id)).catch(() => { });
  }, [getUsers, getAllDetails]);

  useEffect(() => {
    if (deviceId) {
      getDeviceDetails(deviceId)
      deviceService.subscribeToDeviceUpdates([deviceId], 750);
    };

    const unsubscribe = eventService.on("device_update", (updatedDevice: DeviceStatusDTO) => {
      if (!deviceId) return;
      if (normalizeMac(updatedDevice.macAddress) !== normalizeMac(deviceId)) return;

      setDevice((prevDevice) => {
        if (!prevDevice) {
          return prevDevice;
        }

        return applyDeviceStatusUpdate(prevDevice, updatedDevice);
      });
    });

    return () => {
      deviceService.unsubscribeFromDeviceUpdates();
      unsubscribe();
    };
  }, [deviceId, getDeviceDetails]);

  useEffect(() => {
    return eventService.on("device_busy", (busy) => {
      setDevice((prevDevice) =>
        prevDevice ? applyDeviceBusyUpdate(prevDevice, busy) : prevDevice,
      );
    });
  }, []);

  const handleLogin = async (macAddress: string, userName: string): Promise<void> => {
    await handleLoadingAction<Device | null>(
      {
        onError: (err) => notifyError("Login failed", err),
        onLoaded: (device) => {
          if (!device) {
            notify.error("Login failed", "Failed to login to device");
          }
          else {
            setDevice(device)
            notify.success("Login successful", `Logged in as ${userName} on device ${device.name}`);
          }
        }
      },
      () => deviceService.loginToDevice(macAddress, userName)
    ).catch(() => { });
  };

  // Show full-page placeholder while fetching the device
  if (isLoadingDevice) {
    return <DeviceViewPlaceholder />;
  }

  if (!device) {
    return (
      <Container className="p-4">
        <h2>Device with ID {deviceId} not found</h2>
      </Container>
    );
  }

  return (
    <Container
      className={`device-card ${isPending || !device.isOnline ? 'faded' : ''}`}
    >
      <Row className="mb-3 justify-content-start">
        <div
          onClick={() => getDeviceDetails(deviceId!)}
          style={{ color: device.isOnline ? 'green' : 'red', cursor: 'pointer' }}>
          {device.isOnline ? 'Online' : 'Offline'}
          <IoMdRefresh />
          {device.busyOperation && (
            <Badge bg="warning" text="dark" className="ms-2">Busy: {device.busyOperation}</Badge>
          )}
        </div>
        <Col xs="auto" className="text-start">
          <div style={{ fontWeight: "bold", fontSize: "1.1em", textDecoration: "none", color: "var(--netio-green)" }}>{device.name}</div>
          <div>{device.originalName}</div>
        </Col>
        <Col xs="auto" className="text-start">
          <div>{device.model}</div>
          <div>{device.macAddress}</div>
        </Col>
        <Col xs="auto" className="text-start">
          <div
            style={{ color: "var(--netio-green)", cursor: "pointer" }}
            onClick={() => os.open(`http://${device.ipAddress}`)}
          >
            {device.ipAddress}
          </div>
          <div>Logged as: {device.user || "No one"}</div>
        </Col>
        {/* end of row */}
        <Col xs="auto" className="ms-auto text-end">
          <div className="d-flex align-items-center">
            <span className="mx-2">fw: {device.fwVersion}</span>
            <Button variant="outline-netio" className="me-2" onClick={() => { deviceService.unsubscribeFromDeviceUpdates(); setUpdateModalOpen(true) }}>
              Update
            </Button>
            <IconButton
              icon={<FiSettings />}
              onClick={() => { setConfigModalOpen(true); }}
              title="Manage configuration"
            />
          </div>
        </Col>
        <Col xs="auto" className="text-end">
          <IconButton
            icon={<MdOutlineEdit />}
            onClick={async () => {
              await getUsers();
              setSettingsModalOpen(true);
            }}
          />
        </Col>
      </Row>
      <Row>
        {device.isLoggedIn || !device.isOnline ? (
          <div className="sockets-container justify-content-center">
            {device.sockets.map((socket) => (
              <Col key={`${socket.id[0]}-${socket.id[1]}-socket`} className="mb-3" xs="auto">
                <SocketSwitch
                  key={`${socket.id[0]}-${socket.id[1]}-socket`}
                  socket={socket}
                  toggleFunction={
                    async (id, newState) => {
                      try {
                        const updatedDevice = await deviceService.controlSocket(
                          id,
                          newState,
                        );

                        setDevice((prevDevice) => {
                          if (!prevDevice) {
                            return updatedDevice;
                          }
                          return mergeDeviceWithSocketPreserve(
                            prevDevice,
                            updatedDevice,
                          );
                        });
                      } catch (err) {
                        notifyError("Failed to switch output", err);
                      }
                    }
                  }
                  disabled={isPending || !device.isOnline || !!device.busyOperation}
                />
              </Col>
            ))}
          </div>
        ) : (
          <LoginOverlay
            users={users}
            user={device.user}
            onLogin={(userName) => handleLogin(device.macAddress, userName)}
          />
        )}
      </Row>
      <Row className="mt-4">
        <Col>
          <h4>Device Info</h4>
          {isLoadingDetails ? <DeviceInfoPlaceholder /> : <DeviceInfoPanel info={info} />}
        </Col>
      </Row>
      <FirmwareUploadModal show={updateModalOpen} onHide={() => { setUpdateModalOpen(false); getDeviceDetails(device.macAddress); deviceService.subscribeToDeviceUpdates([device.macAddress]); }} selectedDevices={[device]} />
      {configModalOpen && (
        <ConfigManagementModal
          show={configModalOpen}
          onHide={() => { setConfigModalOpen(false); getDeviceDetails(device.macAddress); deviceService.subscribeToDeviceUpdates([device.macAddress]); }}
          selectedDevices={[device]}
        />
      )}
      <DeviceSettingsModal
        show={settingsModalOpen}
        onHide={() => setSettingsModalOpen(false)}
        device={device}
        users={users}
        onDeviceUpdated={(updatedDevice) => {
          setDevice(updatedDevice);
          setSettingsModalOpen(false);
        }}
      />
    </Container>
  );
}


/** Placeholder skeleton shown while the device is being fetched */
const DeviceViewPlaceholder: React.FC = () => (
  <Container className="device-card">
    <Row className="mb-3 justify-content-start">
      {/* Online/Offline indicator */}
      <Placeholder as="div" animation="glow" className="mb-1">
        <Placeholder style={{ width: "4rem" }} />
      </Placeholder>

      {/* Name + original name */}
      <Col xs="auto" className="text-start">
        <Placeholder as="div" animation="glow" className="mb-1">
          <Placeholder style={{ width: "10rem", height: "1.2em" }} />
        </Placeholder>
        <Placeholder as="div" animation="glow">
          <Placeholder style={{ width: "8rem" }} />
        </Placeholder>
      </Col>

      {/* Model + MAC */}
      <Col xs="auto" className="text-start">
        <Placeholder as="div" animation="glow" className="mb-1">
          <Placeholder style={{ width: "7rem" }} />
        </Placeholder>
        <Placeholder as="div" animation="glow">
          <Placeholder style={{ width: "9rem" }} />
        </Placeholder>
      </Col>

      {/* IP + user */}
      <Col xs="auto" className="text-start">
        <Placeholder as="div" animation="glow" className="mb-1">
          <Placeholder style={{ width: "8rem" }} />
        </Placeholder>
        <Placeholder as="div" animation="glow">
          <Placeholder style={{ width: "10rem" }} />
        </Placeholder>
      </Col>

      {/* FW version + buttons */}
      <Col xs="auto" className="ms-auto text-end">
        <Placeholder as="div" animation="glow">
          <Placeholder style={{ width: "6rem" }} className="me-2" />
          <Placeholder.Button variant="outline-secondary" style={{ width: "5rem" }} />
        </Placeholder>
      </Col>
      <Col xs="auto" className="text-end">
        <Placeholder as="div" animation="glow">
          <Placeholder style={{ width: "2rem", height: "2rem" }} />
        </Placeholder>
      </Col>
    </Row>

    {/* Socket switches placeholder */}
    <Row>
      <div className="sockets-container justify-content-center">
        {[1, 2, 3, 4].map((i) => (
          <Col key={i} className="mb-3" xs="auto">
            <div className="socket-switch" style={{ minWidth: "6rem", textAlign: "center" }}>
              <Placeholder as="h5" animation="glow">
                <Placeholder style={{ width: "4rem" }} />
              </Placeholder>
              <Placeholder as="p" animation="glow">
                <Placeholder style={{ width: "2rem" }} />
              </Placeholder>
              <Placeholder as="div" animation="glow">
                <Placeholder style={{ width: "3rem", height: "1.4rem", borderRadius: "0.7rem" }} />
              </Placeholder>
            </div>
          </Col>
        ))}
      </div>
    </Row>

    {/* Device Info placeholder */}
    <Row className="mt-4">
      <Col>
        <h4>Device Info</h4>
        <DeviceInfoPlaceholder />
      </Col>
    </Row>
  </Container>
);

/** Placeholder skeleton for the info panel while details are loading */
const DeviceInfoPlaceholder: React.FC = () => (
  <div className="device-info-panel d-flex flex-wrap gap-3">
    {[1, 2, 3].map((i) => (
      <Card key={i} className="info-section mb-3" style={{ minWidth: "18rem" }}>
        <Card.Header className="info-section-header">
          <Placeholder as="span" animation="glow">
            <Placeholder style={{ width: "7rem" }} />
          </Placeholder>
        </Card.Header>
        <Card.Body className="py-2 px-3">
          {[1, 2, 3, 4].map((j) => (
            <div key={j} className="d-flex justify-content-between mb-2">
              <Placeholder as="span" animation="glow" style={{ flex: "0 0 35%" }}>
                <Placeholder style={{ width: "100%" }} />
              </Placeholder>
              <Placeholder as="span" animation="glow" style={{ flex: "0 0 55%" }}>
                <Placeholder style={{ width: "100%" }} />
              </Placeholder>
            </div>
          ))}
        </Card.Body>
      </Card>
    ))}
  </div>
);
