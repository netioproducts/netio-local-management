import React from "react";
import { Col, Row } from "react-bootstrap";
import { GroupCard } from "../components/GroupCard";
import { Group } from "../models/Group";
import { deviceService } from "../services/deviceService";
import { notifyError } from "../services/notificationService";

export const GroupList: React.FC = () => {
  const [groups, setGroups] = React.useState<Group[]>([]);

  const loadGroups = async () => {
    try {
      const groups = await deviceService.getDeviceGroupsP();
      setGroups(groups);
    } catch (err) {
      notifyError("Failed to load groups", err);
    }
  };

  const handleSaveGroup = async (updatedGroup: { id?: number, name: string }) => {
    try {
      if (updatedGroup.id !== undefined) {
        await deviceService.updateDeviceGroup(updatedGroup as Group);
      } else {
        await deviceService.createDeviceGroup(updatedGroup.name);
      }
    } catch (err) {
      notifyError("Failed to save group", err);
    }
    await loadGroups();
  };

  const handleRemoveGroup = async (group: Group) => {
    try {
      await deviceService.removeDeviceGroup(group.id);
      await loadGroups();
    } catch (err) {
      notifyError("Failed to remove group", err);
    }
  }

  React.useEffect(() => {
    loadGroups();
  }, []);

  return (
    <div className="m-4">
      <Row className="g-4">
        {groups.map(g => (
          <Col key={g.id} xs="auto">
            <GroupCard key={g.id} group={g} onSave={handleSaveGroup} onRemove={handleRemoveGroup} />
          </Col>
        ))}
        <Col key="new-group" xs="auto">
          <GroupCard key="new-group" onSave={handleSaveGroup} />
        </Col>
      </Row>
    </div>
  );
};

