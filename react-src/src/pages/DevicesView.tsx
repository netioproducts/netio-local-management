import React, { useEffect } from "react";
import { Col, Row } from "react-bootstrap";
import { DeviceCardSM, DeviceCardSMPlaceholder } from "../components/DeviceCardSM";
import { deviceService } from "../services/deviceService";
import { Device } from "../models/Device";
import { notifyError } from "../services/notificationService";

export const DevicesList: React.FC = () => {
  const [devices, setDevices] = React.useState<Device[]>([]);
  const [isInitialLoading, setIsInitialLoading] = React.useState(true);
  const didInitialLoad = React.useRef(false);

  const loadDevices = async (showLoadingState = false) => {
    if (showLoadingState) {
      setDevices([]);
      setIsInitialLoading(true);
    }

    try {
      const devices = await deviceService.getDevices();
      setDevices(devices);
    } catch (err) {
      notifyError("Failed to load devices", err);
    } finally {
      if (showLoadingState) {
        setIsInitialLoading(false);
      }
    }
  };

  const handleSaveDevice = async (updatedDevice: { ipAddress: string, macAddress?: string }) => {
    try {
      if (updatedDevice.macAddress !== undefined) {
        await deviceService.updateDevice({ ...updatedDevice, macAddress: updatedDevice.macAddress });
      } else {
        await deviceService.createDevice(updatedDevice);
      }
      await loadDevices(true);
    } catch (err) {
      notifyError("Failed to save device", err);
    };
  }

  const handleRemoveDevice = async (device: Device) => {
    try {
      await deviceService.removeDevice(device.macAddress);
      await loadDevices(true);
    } catch (err) {
      notifyError("Failed to remove device", err);
    }
  }

  useEffect(() => {
    if (didInitialLoad.current) {
      return;
    }

    didInitialLoad.current = true;
    void loadDevices(true);
  }, []);

  return (
    <div className="m-4">
      <Row className="g-4">
        {isInitialLoading && (
          <>
            <Col xs="auto">
              <DeviceCardSMPlaceholder />
            </Col>
            <Col xs="auto">
              <DeviceCardSMPlaceholder />
            </Col>
            <Col xs="auto">
              <DeviceCardSMPlaceholder />
            </Col>
          </>
        )}
        {devices.map(d => (
          <Col key={d.macAddress} xs="auto">
            <DeviceCardSM key={d.macAddress} device={d} onSave={handleSaveDevice} onRemove={handleRemoveDevice} />
          </Col>
        ))}
        {!isInitialLoading && (
          <Col key="new-device" xs="auto">
            <DeviceCardSM key="new-device" onSave={handleSaveDevice} />
          </Col>
        )}
      </Row>
    </div>
  );
};
