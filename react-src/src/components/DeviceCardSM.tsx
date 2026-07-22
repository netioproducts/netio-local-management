import { Button, Card, Form, InputGroup, Placeholder } from "react-bootstrap";
import { FaRegTrashAlt } from "react-icons/fa";
import { GoPencil } from "react-icons/go";
import { IoIosAddCircleOutline } from "react-icons/io";
import React from "react";
import { Device } from "../models/Device";

interface DeviceCardSMProps {
  device?: Device;
  onSave: (device: { macAddress?: string, ipAddress: string }) => void;
  onRemove?: (device: Device) => void;
}

export const DeviceCardSM: React.FC<DeviceCardSMProps> = ({ device, onSave, onRemove }) => {
  const [isEditing, setIsEditing] = React.useState(false);
  const [ipAddress, setIpAddress] = React.useState(device?.ipAddress || "");

  const editCard = () => {
    setIsEditing(true);
  };

  const handleSave = () => {
    setIsEditing(false);
    onSave?.({ ipAddress, macAddress: device?.macAddress });
    if (!device) {
      setIpAddress("");
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setIpAddress(device?.ipAddress || "");
  };

  const handleRemove = () => {
    setIsEditing(false);
    if (device) {
      onRemove?.(device);
    }
  };

  return (
    <Card className="shadow-sm border-0" style={{ backgroundColor: device?.isOnline ? "#d4edda" : "#e9e9e9", width: "15em", color: isEditing ? "#000000" : "#aaaaaa" }}>
      <Card.Body className="p-4">
        <Card.Title className="mb-4 fw-bold text-dark">
          {(device &&
            <span onClick={editCard} style={{ cursor: 'pointer' }}>
              <span>{device.macAddress}</span>
              <GoPencil className="ms-2" />
            </span>
          ) || (!isEditing &&
            <span onClick={editCard} style={{ cursor: 'pointer' }}>
              <IoIosAddCircleOutline />
              <span className="ms-2">Add Device</span>
            </span>
            )}
        </Card.Title>
        <Form.Group className="mb-3">
          <Form.Label className="text-muted small fw-semibold">
            IP Address
          </Form.Label>
          <InputGroup>
            <Form.Control
              type="text"
              value={ipAddress}
              className="bg-light border-0"
              onChange={(e) => setIpAddress(e.target.value)}
              readOnly={!isEditing}
            />
          </InputGroup>
        </Form.Group>
        {!device && !isEditing && (
          <span className="text-muted small">Device have to be available</span>
        )}
      </Card.Body>
      <Card.Footer className="bg-transparent border-0 text-end">
        {isEditing && <Button variant="netio" size="sm" onClick={handleSave}>Save</Button>}
        {isEditing && <Button variant="secondary" size="sm" className="ms-2" onClick={handleCancel}>Cancel</Button>}
        {isEditing && device && <Button variant="danger" size="sm" className="ms-2" onClick={handleRemove}><FaRegTrashAlt /></Button>}
      </Card.Footer>
    </Card>
  );
};

export const DeviceCardSMPlaceholder: React.FC = () => {
  return (
    <Card className="shadow-sm border-0" style={{ backgroundColor: "#e9e9e9", width: "15em" }}>
      <Card.Body className="p-4">
        <Placeholder as="h5" animation="glow" className="mb-4">
          <Placeholder style={{ width: "11rem" }} />
        </Placeholder>

        <Form.Group className="mb-3">
          <Placeholder as={Form.Label} animation="glow" className="mb-2">
            <Placeholder style={{ width: "5rem" }} />
          </Placeholder>
          <Placeholder as="div" animation="glow">
            <Placeholder style={{ width: "100%", height: "2.4rem" }} />
          </Placeholder>
        </Form.Group>

        <Placeholder as="p" animation="glow" className="mb-0">
          <Placeholder style={{ width: "9rem" }} />
        </Placeholder>
      </Card.Body>
      <Card.Footer className="bg-transparent border-0 text-end">
        <Placeholder as="span" animation="glow">
          <Placeholder style={{ width: "4rem", height: "1.6rem" }} />
        </Placeholder>
      </Card.Footer>
    </Card>
  );
};
