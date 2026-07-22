import { Button, Card, Form, InputGroup } from "react-bootstrap";
import { User } from "../models/User";
import { FaRegEye, FaRegEyeSlash, FaRegTrashAlt } from "react-icons/fa";
import { GoPencil } from "react-icons/go";
import { IoIosAddCircleOutline } from "react-icons/io";
import React from "react";

interface UserCardProps {
  user?: User;
  onSave: (user: User) => void;
  onRemove?: (user: User) => void;
}

export const UserCard: React.FC<UserCardProps> = ({ user, onSave, onRemove }) => {
  const [showPassword, setShowPassword] = React.useState(false);
  const [isEditing, setIsEditing] = React.useState(false);
  const [username, setUsername] = React.useState(user?.username || "");
  const [password, setPassword] = React.useState(user?.password || "");
  const [name, setName] = React.useState(user?.name || "");

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  const editCard = () => {
    setIsEditing(true);
  };

  const handleSave = () => {
    setIsEditing(false);
    onSave?.({ username, password, name });
    if (!user) {
      setUsername("");
      setPassword("");
      setName("");
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setUsername(user?.username || "");
    setName(user?.name || "");
    setPassword(user?.password || "");
  };

  return (
    <Card className="shadow-sm border-0" style={{ backgroundColor: "#e9e9e9", width: "15em", color: isEditing ? "#000000" : "#aaaaaa" }}>
      <Card.Body className="p-4">
        <Card.Title className="mb-4 fw-bold text-dark">
          {(user &&
            <span onClick={editCard} style={{ cursor: 'pointer' }}>
              <span>{name}</span>
              <GoPencil className="ms-2" />
            </span>
          ) || (!isEditing &&
            <span onClick={editCard} style={{ cursor: 'pointer' }}>
              <IoIosAddCircleOutline />
              <span className="ms-2">New User</span>
            </span>
            ) || (isEditing &&
              <Form.Control
                type="text"
                value={name}
                className="bg-light border-0"
                onChange={(e) => setName(e.target.value)}
                placeholder="Profile name"
              />
            )}
        </Card.Title>

        <Form.Group className="mb-3">
          <Form.Label className="text-muted small fw-semibold">
            Username
          </Form.Label>

          <InputGroup>
            <Form.Control
              type="text"
              readOnly={!isEditing}
              value={username}
              className="bg-light border-0"
              onChange={(e) => setUsername(e.target.value)}
            />
          </InputGroup>
        </Form.Group>

        <Form.Group className="mb-0">
          <Form.Label className="text-muted small fw-semibold">
            Password
          </Form.Label>
          <InputGroup>
            <Form.Control
              type={showPassword ? 'text' : 'password'}
              readOnly={!isEditing}
              value={password}
              className="bg-light border-0"
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button
              variant="light"
              className="bg-light border-0"
              onClick={togglePasswordVisibility}
            >
              {showPassword ? <FaRegEyeSlash size={18} /> : <FaRegEye size={18} />}
            </Button>
          </InputGroup>
        </Form.Group>
      </Card.Body>
      <Card.Footer className="bg-transparent border-0 text-end">
        {isEditing && <Button variant="netio" size="sm" onClick={handleSave}>Save</Button>}
        {isEditing && <Button variant="secondary" size="sm" className="ms-2" onClick={handleCancel}>Cancel</Button>}
        {isEditing && user && <Button variant="danger" size="sm" className="ms-2" onClick={() => onRemove?.(user)}><FaRegTrashAlt /></Button>}
      </Card.Footer>
    </Card>
  );
};
