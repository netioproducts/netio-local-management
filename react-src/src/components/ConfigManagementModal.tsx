import React from 'react';
import { Modal, Tab, Tabs } from 'react-bootstrap';
import { Device } from '../models/Device';
import { ConfigImportModal } from './ConfigImportModal';
import { ConfigExportModal } from './ConfigExportModal';
import { ConfigRestoreModal } from './ConfigRestoreModal';

interface ConfigManagementModalProps {
  show: boolean;
  onHide: () => void;
  selectedDevices: Device[];
}

export const ConfigManagementModal: React.FC<ConfigManagementModalProps> = ({
  show,
  onHide,
  selectedDevices
}) => {
  return (
    <Modal show={show} onHide={onHide} centered size="lg" backdrop="static">
      <Modal.Header closeButton>
        <Modal.Title>Manage Configuration</Modal.Title>
      </Modal.Header>
      <Modal.Body className="p-0 pt-3">
        <Tabs defaultActiveKey="export" className="px-3" justify>
          <Tab eventKey="import" title="Import Configuration">
            <ConfigImportModal show={true} onHide={onHide} selectedDevices={selectedDevices} embedded />
          </Tab>
          <Tab eventKey="restore" title="Restore from Backup">
            <ConfigRestoreModal show={true} onHide={onHide} selectedDevices={selectedDevices} embedded />
          </Tab>
          <Tab eventKey="export" title="Export Configuration">
            <ConfigExportModal show={true} onHide={onHide} selectedDevices={selectedDevices} embedded />
          </Tab>
        </Tabs>
      </Modal.Body>
    </Modal>
  );
};
