import React, { useEffect, useState } from 'react';
import { Modal, Button, ListGroup, ProgressBar, Alert, Spinner } from 'react-bootstrap';
import { Device } from '../models/Device';
import { os } from "@neutralinojs/lib";
import { deviceService } from '../services/deviceService';
import { eventService } from '../services/eventService';
import { RxExclamationTriangle, RxCheckCircled, RxCrossCircled } from "react-icons/rx";
import { notifyError } from '../services/notificationService';

interface ConfigImportModalProps {
  show: boolean;
  onHide: () => void;
  selectedDevices: Device[];
  embedded?: boolean;
}

export const ConfigImportModal: React.FC<ConfigImportModalProps> = ({
  show,
  onHide,
  selectedDevices,
  embedded
}) => {
  const [devices, setDevices] = useState<Device[]>(selectedDevices);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [statusMap, setStatusMap] = useState<Record<string, string>>({});
  const [progressMap, setProgressMap] = useState<Record<string, number>>({});
  const [successfulDevices, setSuccessfulDevices] = useState<Set<string>>(new Set());
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    const unsubscribe = eventService.on('config_progress', (data) => {
      setProgressMap(prev => ({ ...prev, [data.macAddress]: data.progress }));
      setStatusMap(prev => ({ ...prev, [data.macAddress]: data.status }));
    });

    return unsubscribe;
  }, []);

  const handleSelectFileClick = async () => {
    try {
      const entries = await os.showOpenDialog('Choose a config file (.json)', {
        filters: [
          { name: 'JSON configuration', extensions: ['json'] }
        ]
      });

      if (entries && entries.length > 0) {
        setFilePath(entries[0]);
      }

      if (!isImporting && successfulDevices.size === devices.length) {
        setSuccessfulDevices(new Set());
      }
    } catch (err) {
      console.debug("File selection denyed or failed:", err);
    }
  };

  const handleImport = async () => {
    if (!filePath || devices.length === 0 || isImporting) return;

    const filteredDevices = devices.filter(d => !successfulDevices.has(d.macAddress));
    setDevices(filteredDevices);

    setIsImporting(true);
    setProgressMap({});
    setStatusMap({});
    setSuccessfulDevices(new Set());

    await Promise.allSettled(filteredDevices.map(async (device) => { // will throw exc if anyone rejects
      return deviceService.importConfig(device.macAddress, filePath).then(
        () => {
          setSuccessfulDevices(prev => new Set(prev).add(device.macAddress));
          deviceService.getDevice(device.macAddress).then(updated => {
            setDevices(prev => prev.map(d => d.macAddress === updated.macAddress ? updated : d));
          }).catch((err) => notifyError(`Failed to refresh device: ${device.name || device.macAddress}`, err));
        },
        (err) => {
          notifyError(`Config import failed: ${device.name || device.macAddress}`, err);
        })
    }));
    setIsImporting(false);
  };

  const handleClose = () => {
    setFilePath(null);
    setStatusMap({});
    setProgressMap({});
    setSuccessfulDevices(new Set());
    onHide();
  };

  const content = (
    <>
      <div className="modal-body">
        <h6 className="mb-3">Devices ({devices.length}):</h6>
        {devices.length === 0 ? (
          <Alert variant="warning">No device chosen for config import.</Alert>
        ) : (
          <ListGroup className="mb-4" style={{ maxHeight: '150px', overflowY: 'auto' }}>
            {devices.map((device) => {
              const currentProgress = progressMap[device.macAddress] || 0;
              const currentStatus = statusMap[device.macAddress] || 'Waiting...';
              return (
                <ListGroup.Item key={device.macAddress} className="d-flex justify-content-between align-items-center gap-1">
                  <div className="text-nowrap">{device.name}</div>
                  <div className="text-nowrap text-muted">{device.fwVersion}</div>
                  <div className="flex-grow-1">
                    <ProgressBar
                      className="overflow-visible"
                      animated={currentProgress > 0 && currentProgress < 100 && currentStatus !== "Failed"}
                      now={currentProgress}
                      label={`${currentStatus}`}
                      variant={currentStatus === "Failed" ? "danger" : currentStatus === "Completed" ? "success" : "primary"}
                    />
                  </div>
                  <div className="text-nowrap"><small className="text-muted">{currentProgress}%</small></div>
                </ListGroup.Item>
              )
            })}
          </ListGroup>
        )}

        <div className="mb-4">
          <p>File: <strong>{filePath ? filePath : 'No file selected'}</strong></p>
          <Button variant="outline-primary" onClick={handleSelectFileClick} disabled={isImporting}>
            Choose Config File
          </Button>
        </div>

        {(isImporting && (
          <div className="text-center">
            <Spinner animation="border" role="status">
              <span className="visually-hidden">Importing...</span>
            </Spinner>
          </div>
        )) || Object.values(statusMap).length === 0
          || (Object.values(statusMap).every(status => status === "Completed") && (
            <div className="text-center text-success fs-1">
              <RxCheckCircled />
            </div>
          )) || (Object.values(statusMap).every(status => status === "Failed") && (
            <div className="text-center text-danger fs-1">
              <RxCrossCircled />
            </div>
          )) || (
            <div className="text-center text-warning fs-1">
              <RxExclamationTriangle />
            </div>
          )
        }
      </div>

      <div className="modal-footer flex-col">
        <small className="text-muted me-auto">
          Disclaimer: Specific settings like alias, hostname and network configuration will be ignored. Use at your own risk, as compatibility may vary between different firmware versions and models.
        </small>
        <div className="d-flex gap-1">
          <Button
            variant="secondary"
            onClick={handleClose}
            disabled={isImporting}
          >
            Close
          </Button>

          {successfulDevices.size < devices.length && (
            <Button
              variant="netio"
              onClick={handleImport}
              disabled={!filePath || devices.length === 0 || isImporting}
            >
              {(isImporting && (
                <>
                  <Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" className="me-2" />
                  Importing...
                </>
              )) || (Object.values(statusMap).some(status => status === "Failed") && "Retry Failed")
                || (
                  'Start import'
                )}
            </Button>
          )}
        </div>
      </div>
    </>
  );

  if (embedded) return content;

  return (
    <Modal show={show} onHide={handleClose} backdrop={isImporting ? 'static' : true} centered size="lg">
      <Modal.Header closeButton={isImporting}>
        <Modal.Title>Configuration Import</Modal.Title>
      </Modal.Header>
      {content}
    </Modal>
  );
};
