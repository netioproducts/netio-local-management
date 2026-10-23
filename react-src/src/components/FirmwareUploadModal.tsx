import React, { useEffect, useState } from 'react';
import { Modal, Button, ListGroup, ProgressBar, Alert, Spinner } from 'react-bootstrap';
import { Device } from '../models/Device';
import { os } from "@neutralinojs/lib";
import { deviceService } from '../services/deviceService';
import { eventService } from '../services/eventService';
import { RxExclamationTriangle, RxCheckCircled, RxCrossCircled } from "react-icons/rx";
import { notifyError } from '../services/notificationService';
import { createLogger } from "../services/logger";

const log = createLogger("FirmwareUploadModal");

interface FirmwareUploadModalProps {
  show: boolean;
  onHide: () => void;
  selectedDevices: Device[];
}

export const FirmwareUploadModal: React.FC<FirmwareUploadModalProps> = ({
  show,
  onHide,
  selectedDevices
}) => {
  const [devices, setDevices] = useState<Device[]>(selectedDevices);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [statusMap, setStatusMap] = useState<Record<string, string>>({});
  const [progressMap, setProgressMap] = useState<Record<string, number>>({});
  const [successfulDevices, setSuccessfulDevices] = useState<Set<string>>(new Set());
  const [isUpgrading, setIsUpgrading] = useState(false);

  useEffect(() => {
    const unsubscribe = eventService.on('firmware_progress', (data) => {
      setProgressMap(prev => ({ ...prev, [data.macAddress]: data.progress }));
      setStatusMap(prev => ({ ...prev, [data.macAddress]: data.status }));
    });

    return unsubscribe;
  }, []);

  const handleSelectFileClick = async () => {
    try {
      const entries = await os.showOpenDialog('Choose a firmware file (.package)');

      if (entries && entries.length > 0) {
        setFilePath(entries[0]);
      }

      if (!isUpgrading && successfulDevices.size === devices.length) {
        setSuccessfulDevices(new Set());
      }
    } catch (err) {
      log.debug("File selection cancelled or failed", err);
    }
  };

  const handleUpload = async () => {
    if (!filePath || devices.length === 0 || isUpgrading) return;

    const filteredDevices = devices.filter(d => !successfulDevices.has(d.macAddress));
    setDevices(filteredDevices);

    setIsUpgrading(true);
    setProgressMap({});
    setStatusMap({});
    setSuccessfulDevices(new Set());

    await Promise.allSettled(filteredDevices.map(async (device) => { // will throw exc if anyone rejects
      return deviceService.uploadFirmware(device.macAddress, filePath).then(
        () => {
          setSuccessfulDevices(prev => new Set(prev).add(device.macAddress));
          deviceService.getDevice(device.macAddress).then(updated => {
            setDevices(prev => prev.map(d => d.macAddress === updated.macAddress ? updated : d));
          }).catch((err) => notifyError(`Failed to refresh device: ${device.name || device.macAddress}`, err));
        },
        (err) => {
          notifyError(`Firmware update failed: ${device.name || device.macAddress}`, err);
        })
    }));
    setIsUpgrading(false);
  };

  const handleClose = () => {
    setFilePath(null);
    setStatusMap({});
    setProgressMap({});
    setSuccessfulDevices(new Set());
    onHide();
  };

  return (
    <Modal show={show} onHide={handleClose} backdrop={isUpgrading ? 'static' : true} centered size="lg">
      <Modal.Header closeButton={isUpgrading}>
        <Modal.Title>Firmware Update</Modal.Title>
      </Modal.Header>

      <Modal.Body>
        <h6 className="mb-3">Devices ({devices.length}):</h6>
        {devices.length === 0 ? (
          <Alert variant="warning">No device chosen for update.</Alert>
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
        {
          devices.length > 1 && new Set(devices.map(d => d.fwVersion)).size > 1 && (
            <Alert variant="warning">
              Selected devices have different firmware versions. Make sure the chosen firmware file is compatible with all devices.
            </Alert>
          )
        }

        <div className="mb-4">
          <p>File: <strong>{filePath ? filePath : 'No file selected'}</strong></p>
          <Button variant="outline-primary" onClick={handleSelectFileClick} disabled={isUpgrading}>
            Choose Firmware File
          </Button>
        </div>

        {(isUpgrading && (
          <div className="text-center">
            <Spinner animation="border" role="status">
              <span className="visually-hidden">Upgrading...</span>
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
      </Modal.Body>

      <Modal.Footer className="flex-col">
        <small className="text-muted me-auto">
          Disclaimer: This carries the same risks as updating firmware via the device's web UI.
        </small>
        <div className="d-flex gap-1">
          <Button
            variant="secondary"
            onClick={handleClose}
            disabled={isUpgrading}
          >
            Close
          </Button>

          {successfulDevices.size < devices.length && (
            <Button
              variant="netio"
              onClick={handleUpload}
              disabled={!filePath || devices.length === 0 || isUpgrading}
            >
              {(isUpgrading && (
                <>
                  <Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" className="me-2" />
                  Updating...
                </>
              )) || (Object.values(statusMap).some(status => status === "Failed") && "Retry Failed")
                || (
                  'Start upload'
                )}
            </Button>
          )}
        </div>
      </Modal.Footer>
    </Modal>
  );
};