import React, { useEffect, useRef, useState } from "react";
import { Modal, Button, Form, Row, Col, Spinner } from "react-bootstrap";
import { Device } from "../models/Device";
import { User } from "../models/User";
import { deviceService } from "../services/deviceService";
import { notify } from "../services/notificationService";

interface DeviceSettingsModalProps {
  show: boolean;
  onHide: () => void;
  device: Device;
  users: User[];
  onDeviceUpdated: (device: Device) => void;
}

interface FormErrors {
  deviceName?: string;
  socketNames?: Record<number, string>;
}

export const DeviceSettingsModal: React.FC<DeviceSettingsModalProps> = ({
  show,
  onHide,
  device,
  users,
  onDeviceUpdated,
}) => {
  const didInitRef = useRef(false);
  const [deviceName, setDeviceName] = useState(device.name);
  const [socketNames, setSocketNames] = useState<Record<number, string>>({});
  const [selectedUser, setSelectedUser] = useState(device.user || "");
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isChangingUser, setIsChangingUser] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    if (show && !didInitRef.current) {
      setDeviceName(device.name);
      setSelectedUser(device.user || "");

      const initialSocketNames: Record<number, string> = {};
      device.sockets.forEach((socket) => {
        initialSocketNames[socket.id[1]] = socket.label;
      });
      setSocketNames(initialSocketNames);
      setErrors({});
      didInitRef.current = true;
    }

    if (!show && didInitRef.current) {
      didInitRef.current = false;
    }
  }, [show, device]);

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!deviceName.trim()) {
      newErrors.deviceName = "Device name is required";
    }

    const socketErrors: Record<number, string> = {};
    Object.entries(socketNames).forEach(([idx, name]) => {
      if (!name.trim()) {
        socketErrors[Number(idx)] = "Socket name is required";
      }
    });

    if (Object.keys(socketErrors).length > 0) {
      newErrors.socketNames = socketErrors;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const hasChanges = (): boolean => {
    if (deviceName !== device.name) return true;

    for (const socket of device.sockets) {
      const socketIndex = socket.id[1];
      if (socketNames[socketIndex] !== socket.label) {
        return true;
      }
    }

    return false;
  };

  const handleSave = async () => {
    if (!validateForm()) {
      return;
    }

    setIsSaving(true);
    try {
      let updatedDevice = device;
      if (deviceName !== device.name) {
        updatedDevice = await deviceService.updateDeviceName(
          device.macAddress,
          deviceName,
        );
      }

      const hasSocketChanges = device.sockets.some((socket) => {
        const socketIndex = socket.id[1];
        return socketNames[socketIndex] !== socket.label;
      });

      if (hasSocketChanges) {
        const socketNamesArray: string[] = [];
        device.sockets.forEach((socket) => {
          const socketIndex = socket.id[1];
          socketNamesArray[socketIndex - 1] = socketNames[socketIndex];
        });

        updatedDevice = await deviceService.updateSocketNames(
          device.macAddress,
          socketNamesArray,
        );
      }

      notify.success("Settings saved", "Device settings updated successfully");
      onDeviceUpdated(updatedDevice);
      onHide();
    } catch (error) {
      notify.error("Save failed", String(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleUserChange = async () => {
    if (!selectedUser || selectedUser === device.user) {
      return;
    }

    setIsChangingUser(true);
    try {
      const updatedDevice = await deviceService.changeDeviceUser(
        device.macAddress,
        selectedUser,
      );
      notify.success("User changed", `Switched to user ${selectedUser}`);
      onDeviceUpdated(updatedDevice);
      onHide();
    } catch (error) {
      notify.error("User change failed", String(error));
      setSelectedUser(device.user || "");
    } finally {
      setIsChangingUser(false);
    }
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      const updatedDevice = await deviceService.logoutFromDevice(
        device.macAddress,
      );
      notify.success("Logged out", "Successfully logged out from device");
      onDeviceUpdated(updatedDevice);
      onHide();
    } catch (error) {
      notify.error("Logout failed", String(error));
    } finally {
      setIsLoggingOut(false);
    }
  };

  const handleCancel = () => {
    onHide();
  };

  return (
    <Modal show={show} onHide={onHide} backdrop="static" centered size="lg">
      <Modal.Header closeButton>
        <Modal.Title>Device Settings</Modal.Title>
      </Modal.Header>

      <Modal.Body>
        <Form.Group className="mb-4">
          <Form.Label>
            <strong>Device Name</strong>
          </Form.Label>
          <Form.Control
            type="text"
            value={deviceName}
            onChange={(e) => setDeviceName(e.target.value)}
            isInvalid={!!errors.deviceName}
            disabled={isSaving}
            placeholder="Enter device name"
            autoFocus
          />
          <Form.Control.Feedback type="invalid">
            {errors.deviceName}
          </Form.Control.Feedback>
        </Form.Group>

        <Form.Group className="mb-4">
          <Form.Label>
            <strong>Socket Names</strong>
          </Form.Label>
          {device.sockets.map((socket) => {
            const socketIndex = socket.id[1];
            return (
              <Row key={socket.id.join("-")} className="mb-2">
                <Col xs={3} className="d-flex align-items-center">
                  <Form.Label className="mb-0">Socket {socketIndex}:</Form.Label>
                </Col>
                <Col xs={9}>
                  <Form.Control
                    type="text"
                    value={socketNames[socketIndex] || ""}
                    onChange={(e) =>
                      setSocketNames((prev) => ({
                        ...prev,
                        [socketIndex]: e.target.value,
                      }))
                    }
                    isInvalid={!!errors.socketNames?.[socketIndex]}
                    disabled={isSaving}
                    placeholder={`Enter name for socket ${socketIndex}`}
                  />
                  <Form.Control.Feedback type="invalid">
                    {errors.socketNames?.[socketIndex]}
                  </Form.Control.Feedback>
                </Col>
              </Row>
            );
          })}
        </Form.Group>

        <Form.Group className="mb-3">
          <Form.Label>
            <strong>User</strong>
          </Form.Label>
          <Row>
            <Col xs={12} md={8} className="mb-2">
              <Form.Select
                value={selectedUser}
                onChange={(e) => setSelectedUser(e.target.value)}
                disabled={isChangingUser || isLoggingOut}
              >
                <option value="">-- Select user --</option>
                {users.map((user) => (
                  <option key={user.name} value={user.name}>
                    {user.name}
                  </option>
                ))}
              </Form.Select>
            </Col>
            <Col xs={12} md={4}>
              <div className="d-grid gap-2">
                {selectedUser !== device.user && selectedUser && (
                  <Button
                    variant="primary"
                    onClick={handleUserChange}
                    disabled={isChangingUser || isLoggingOut}
                  >
                    {isChangingUser ? (
                      <>
                        <Spinner
                          as="span"
                          animation="border"
                          size="sm"
                          className="me-2"
                        />
                        Changing...
                      </>
                    ) : (
                      "Change User"
                    )}
                  </Button>
                )}
                <Button
                  variant="danger"
                  onClick={handleLogout}
                  disabled={!device.isLoggedIn || isLoggingOut || isChangingUser}
                >
                  {isLoggingOut ? (
                    <>
                      <Spinner
                        as="span"
                        animation="border"
                        size="sm"
                        className="me-2"
                      />
                      Logging out...
                    </>
                  ) : (
                    "Log Out"
                  )}
                </Button>
              </div>
            </Col>
          </Row>
        </Form.Group>
      </Modal.Body>

      <Modal.Footer>
        <Button variant="secondary" onClick={handleCancel} disabled={isSaving}>
          Cancel
        </Button>
        <Button
          variant="netio"
          onClick={handleSave}
          disabled={!hasChanges() || isSaving}
        >
          {isSaving ? (
            <>
              <Spinner
                as="span"
                animation="border"
                size="sm"
                className="me-2"
              />
              Saving...
            </>
          ) : (
            "Save Changes"
          )}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};
