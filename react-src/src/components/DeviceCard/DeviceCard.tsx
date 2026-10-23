import Form from "react-bootstrap/esm/Form";
import { Device } from "../../models/Device";
import { Socket, SocketId } from "../../models/Socket";
import { User } from "../../models/User";
import React from "react";
import Container from "react-bootstrap/esm/Container";
import Spinner from "react-bootstrap/esm/Spinner";
import LoginOverlay from "./LoginOverlay";
import "./DeviceCard.css";
import { Badge, Placeholder } from "react-bootstrap";
import { Link } from "react-router";
import { RxExclamationTriangle } from "react-icons/rx";

interface DeviceCardProps {
  device: Device;
  sockets: SocketSwitchProps[];
  selected: boolean;
  toggleSelected: () => void;
  isPending?: boolean;
  users: User[];
  onLogin: (macAddress: string, userName: string) => void;
}

export const DeviceCard: React.FC<DeviceCardProps> = ({ device, sockets, selected, toggleSelected, isPending, users, onLogin }: DeviceCardProps) => {
  const [isHovered, setIsHovered] = React.useState(false);

  return (
    <Container
      className={`device-card d-flex ${isPending || !device.isOnline ? 'faded' : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div style={{ visibility: isHovered || selected ? 'visible' : 'hidden' }}>
        <Form.Check
          className="me-2 mb-0 socket-select"
          type="checkbox"
          checked={selected}
          onChange={toggleSelected}
          aria-label="Select"
        />
      </div>
      <div className="device-attributes">
        <Link to={`/device/${device.macAddress}`} style={{ fontWeight: "bold", fontSize: "1.1em", textDecoration: "none", color: "var(--netio-green)" }}>{device.name}</Link>
        <span>{device.macAddress}</span>
        <span>{device.ipAddress}</span>
        <span>{device.model}</span>
        <span>{device.fwVersion}</span>
        <span style={{ color: device.isOnline ? 'green' : 'red' }}>{device.isOnline ? 'Online' : 'Offline'}</span>
        {device.busyOperation && (
          <span><Badge bg="warning" text="dark">Busy: {device.busyOperation}</Badge></span>
        )}
      </div>
      {device.isLoggedIn || !device.isOnline ? (
        <div className="sockets-container">
          {sockets.map((socketProp) => (
            <SocketSwitch
              key={`${socketProp.socket.id[0]}-${socketProp.socket.id[1]}-socket`}
              socket={socketProp.socket}
              toggleFunction={socketProp.toggleFunction}
              disabled={isPending || !device.isOnline || !!device.busyOperation}
            />
          ))}
        </div>
      ) : (
        <LoginOverlay
          users={users}
          user={device.user}
          onLogin={(userName) => onLogin(device.macAddress, userName)}
        />
      )}
    </Container>
  );
};

interface SocketSwitchProps {
  socket: Socket;
  toggleFunction: (id: SocketId, newState: boolean) => Promise<void>;
  disabled?: boolean;
}

export const SocketSwitch: React.FC<SocketSwitchProps> = ({ socket, toggleFunction, disabled }: SocketSwitchProps) => {
  const [pending, setPending] = React.useState(false);
  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newState = e.target.checked;
    setPending(true);
    try {
      await toggleFunction(socket.id, newState);
    } finally {
      setPending(false);
    }
  };

  return (
    <Form className="socket-switch">
      <h5>{socket.label}</h5>
      {socket.originalLabel && <span className="original-label">{socket.originalLabel}</span>}
      <div className="status-indicator" style={{ minHeight: '24px' }}>
        {pending ? (
          <Spinner animation="border" size="sm" role="status">
            <span className="visually-hidden">Loading...</span>
          </Spinner>
        ) : (
          <p className="m-0">{socket.status ? 'On' : 'Off'}</p>
        )}
      </div>
      <Form.Check
        className="socket-switch"
        type="switch"
        id={`${socket.id[0]}-${socket.id[1]}-switch`}
        checked={Boolean(socket.status)}
        onChange={handleChange}
        disabled={pending || disabled}
      />
      {socket.load !== undefined &&
        <span className="energy-info">
          {socket.load} W
        </span>}
    </Form>
  );
};

export const CompactSocketState: React.FC<SocketSwitchProps> = ({ socket, toggleFunction, disabled }: SocketSwitchProps) => {
  const [pending, setPending] = React.useState(false);
  const handleClick = async () => {
    if (pending || disabled) return;
    const newState = !socket.status;
    setPending(true);
    try {
      await toggleFunction(socket.id, newState);
    } finally {
      setPending(false);
    }
  };

  return (
    <div
      className={`compact-socket-state ${disabled ? 'disabled' : ''} ${pending ? 'pending' : ''}`}
      onClick={handleClick}
    >
      <span className="socket-label" style={{ fontWeight: '500' }}>{socket.label}</span>|{' '}
      {pending ? (
        <Spinner animation="border" size="sm" role="status" style={{ width: '1em', height: '1em', borderWidth: '0.15em' }}>
          <span className="visually-hidden">Loading...</span>
        </Spinner>
      ) : (
        <span className={`socket-status ${socket.status ? 'text-success' : 'text-muted'}`}>
          {socket.status ? 'On' : 'Off'}
        </span>
      )}
    </div>
  );
};

export const DeviceCardPlaceholder: React.FC = () => {
  return (
    <Container className="device-card d-flex">
      <div className="device-attributes" style={{ flex: 1, paddingLeft: '4em' }}>
        <Placeholder as="h5" animation="glow" className="mb-1">
          <Placeholder style={{ width: "12rem" }} />
        </Placeholder>
        <Placeholder as="p" animation="glow" className="mb-0">
          <Placeholder style={{ width: "8rem" }} />
        </Placeholder>
        <Placeholder as="p" animation="glow" className="mb-0">
          <Placeholder style={{ width: "10rem" }} />
        </Placeholder>
        <Placeholder as="p" animation="glow" className="mb-0">
          <Placeholder style={{ width: "9rem" }} />
        </Placeholder>
        <Placeholder as="p" animation="glow" className="mb-0">
          <Placeholder style={{ width: "15rem" }} />
        </Placeholder>
        <Placeholder as="p" animation="glow" className="mb-0">
          <Placeholder bg="success" style={{ width: "6rem" }} />
        </Placeholder>
      </div>
    </Container>
  );
};

export const DeviceCardCompact: React.FC<DeviceCardProps> = ({ device, sockets, selected, toggleSelected, isPending, users, onLogin }: DeviceCardProps) => {
  const [isHovered, setIsHovered] = React.useState(false);

  return (
    <Container
      className={`device-card-compact ${isPending || !device.isOnline ? 'faded' : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div style={{ visibility: isHovered || selected ? 'visible' : 'hidden' }}>
        <Form.Check
          className="me-2 mb-0 socket-select"
          type="checkbox"
          checked={selected}
          onChange={toggleSelected}
          aria-label="Select"
        />
      </div>
      <div className="device-attributes">
        <Link to={`/device/${device.macAddress}`} style={{ fontWeight: "bold", fontSize: "1.1em", textDecoration: "none", color: "var(--netio-green)" }}>{device.name}</Link>
        <span>{device.fwVersion}</span>
        <span style={{ color: device.isOnline ? 'green' : 'red' }}>{device.isOnline ? 'Online' : 'Offline'}</span>
        {device.busyOperation && (
          <span><Badge bg="warning" text="dark">Busy: {device.busyOperation}</Badge></span>
        )}
      </div>
      {device.isLoggedIn || !device.isOnline ? (
        <div className="sockets-container">
          {sockets.map((socketProp) => (
            <CompactSocketState
              key={`${socketProp.socket.id[0]}-${socketProp.socket.id[1]}-socket-compact-state`}
              socket={socketProp.socket}
              toggleFunction={socketProp.toggleFunction}
              disabled={isPending || !device.isOnline || !!device.busyOperation}
            />
          ))}
        </div>
      ) : (
        <span className="text-muted">
          <RxExclamationTriangle />
          <span className="ms-2">Not logged in</span>
        </span>
      )}
    </Container>
  );
};

export const DeviceCardCompactPlaceholder: React.FC = () => {
  return (
    <Container className="device-card-compact">
      <div className="device-attributes" style={{ flex: 1, paddingLeft: '2em' }}>
        <Placeholder as="h5" animation="glow" className="mb-0">
          <Placeholder style={{ width: "12rem" }} />
        </Placeholder>
        <Placeholder as="p" animation="glow" className="mb-0 ms-3">
          <Placeholder bg="success" style={{ width: "6rem" }} />
        </Placeholder>
      </div>
    </Container>
  );
};
