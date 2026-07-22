import React from "react";
import { Form, Button } from "react-bootstrap";
import { User } from "../../models/User";
import { FiLogIn } from "react-icons/fi";
import "./LoginOverlay.css";

interface LoginOverlayProps {
  users: User[];
  user?: string;
  onLogin: (userName: string) => void;
}

const LoginOverlay: React.FC<LoginOverlayProps> = ({ users, user, onLogin }) => {
  const [selectedUser, setSelectedUser] = React.useState<string>(user || (users.length > 0 ? users[0].name : ""));

  const handleLogin = () => {
    if (selectedUser) {
      onLogin(selectedUser);
    }
  };

  return (
    <div className="login-overlay">
      <div className="login-overlay-content">
        <FiLogIn size={24} className="login-icon" />
        <span className="login-label">Not logged in</span>
        <div className="login-controls">
          <Form.Select
            size="sm"
            value={selectedUser}
            onChange={(e) => setSelectedUser(e.target.value)}
            className="user-select"
          >
            <option value="">Select user…</option>
            {users.map((user) => (
              <option key={user.name} value={user.name}>
                {user.name}
              </option>
            ))}
          </Form.Select>
          <Button
            size="sm"
            variant="outline-success"
            onClick={handleLogin}
            disabled={!selectedUser}
            className="login-btn"
          >
            Log in
          </Button>
        </div>
      </div>
    </div>
  );
};

export default LoginOverlay;
