import { Button, Card, Form } from "react-bootstrap";
import { FaRegTrashAlt } from "react-icons/fa";
import { GoPencil } from "react-icons/go";
import { IoIosAddCircleOutline } from "react-icons/io";
import React from "react";
import { Group } from "../models/Group";

interface GroupCardProps {
  group?: Group;
  onSave: (group: { name: string, id?: number }) => void;
  onRemove?: (group: Group) => void;
}

export const GroupCard: React.FC<GroupCardProps> = ({ group, onSave, onRemove }) => {
  const [isEditing, setIsEditing] = React.useState(false);
  const [name, setName] = React.useState(group?.name || "");

  const editCard = () => {
    setIsEditing(true);
  };

  const handleSave = () => {
    setIsEditing(false);
    onSave?.({ name, id: group?.id });
    if (!group) {
      setName("");
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setName(group?.name || "");
  };

  const handleRemove = () => {
    setIsEditing(false);
    if (group) {
      onRemove?.(group);
    }
  };

  return (
    <Card className="shadow-sm border-0" style={{ backgroundColor: "#e9e9e9", width: "15em", color: isEditing ? "#000000" : "#aaaaaa" }}>
      <Card.Body className="p-4">
        <Card.Title className="mb-4 fw-bold text-dark">
          {(!isEditing && !group &&
            <span onClick={editCard} style={{ cursor: 'pointer' }}>
              <IoIosAddCircleOutline />
              <span className="ms-2">New Group</span>
            </span>
          ) || (isEditing &&
            <Form.Control
              type="text"
              value={name}
              className="bg-light border-0"
              onChange={(e) => setName(e.target.value)}
              placeholder="Group name"
            />
            ) || (group &&
              <span onClick={editCard} style={{ cursor: 'pointer' }}>
                <span>{name}</span>
                <GoPencil className="ms-2" />
              </span>
            )}
        </Card.Title>
      </Card.Body>
      <Card.Footer className="bg-transparent border-0 text-end">
        {isEditing && <Button variant="netio" size="sm" onClick={handleSave}>Save</Button>}
        {isEditing && <Button variant="secondary" size="sm" className="ms-2" onClick={handleCancel}>Cancel</Button>}
        {isEditing && group && <Button variant="danger" size="sm" className="ms-2" onClick={handleRemove}><FaRegTrashAlt /></Button>}
      </Card.Footer>
    </Card>
  );
};
