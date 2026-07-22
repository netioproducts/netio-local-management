import React from "react";
import { User } from "../models/User";
import { appService } from "../services/appSerivce";
import { UserCard } from "../components/UserCard";
import { Col, Row } from "react-bootstrap";

export const UserList: React.FC = () => {
  const [users, setUsers] = React.useState<User[]>([]);

  const loadUsers = async () => {
    try {
      const users = await appService.getUsers();
      setUsers(users);
    } catch (err) {
      console.error("Failed to load users", err);
    }
  };

  const handleSaveUser = async (updatedUser: User) => {
    await appService.saveUser(updatedUser);
    await loadUsers();
  };

  const handleRemoveUser = async (user: User) => {
    try {
      await appService.removeUser(user.name);
      await loadUsers();
    } catch (err) {
      console.error("Failed to remove user", err);
    }
  }

  React.useEffect(() => {
    loadUsers();
  }, []);

  return (
    <div className="m-4">
      <Row className="g-4">
        {users.map(u => (
          <Col key={u.name} xs="auto">
            <UserCard key={u.name} user={u} onSave={handleSaveUser} onRemove={handleRemoveUser} />
          </Col>
        ))}
        <Col key="new-user" xs="auto">
          <UserCard key="new-user" onSave={handleSaveUser} />
        </Col>
      </Row>
    </div>
  );
};

