import React, { useState } from 'react';
import Form from 'react-bootstrap/Form';
import './SocketCard.css';

import { Socket, SocketId } from '../../models/Socket';
import Spinner from 'react-bootstrap/esm/Spinner';

interface SocketCardProps {
  socket: Socket;
  toggleFunction: (id: SocketId, newState: boolean) => Promise<void>;
  selected: boolean;
  toggleSelected: () => void;
  isPending?: boolean;
}

const SocketCard: React.FC<SocketCardProps> = ({ socket, toggleFunction, selected, toggleSelected, isPending }) => {
  const [isHovered, setIsHovered] = useState(false);
  const checked = Boolean(socket.status);

  return (
    <Form className="socket-card" onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
      <div style={{ visibility: isHovered || selected ? 'visible' : 'hidden' }}>
        <Form.Check
          className="me-2 mb-0 socket-select"
          type="checkbox"
          checked={selected}
          onChange={toggleSelected}
          aria-label="Select"
        />
      </div>
      <h4>{socket.label}</h4>
      <span>{socket.originalLabel}</span>
      <div className="status-indicator" style={{ minHeight: '24px' }}>
        {isPending ? (
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
        checked={checked}
        onChange={() => toggleFunction(socket.id, !checked)}
        disabled={isPending}
      />
    </Form>
  );
};

export default SocketCard;