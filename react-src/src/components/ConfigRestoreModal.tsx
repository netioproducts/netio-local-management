import React, { useEffect, useState } from 'react';
import { Modal, Button, ListGroup, ProgressBar, Alert, Spinner } from 'react-bootstrap';
import { Device } from '../models/Device';
import { deviceService } from '../services/deviceService';
import { eventService } from '../services/eventService';
import { RxExclamationTriangle, RxCheckCircled, RxCrossCircled } from "react-icons/rx";
import { notify } from '../services/notificationService';

interface ConfigRestoreModalProps {
  show: boolean;
  onHide: () => void;
  selectedDevices: Device[];
  embedded?: boolean;
}

export const ConfigRestoreModal: React.FC<ConfigRestoreModalProps> = ({
  show,
  onHide,
  selectedDevices,
  embedded
}) => {
  const [devices, setDevices] = useState<Device[]>(selectedDevices);
  const [statusMap, setStatusMap] = useState<Record<string, string>>({});
  const [progressMap, setProgressMap] = useState<Record<string, number>>({});
  const [successfulDevices, setSuccessfulDevices] = useState<Set<string>>(new Set());
  const [isRestoring, setIsRestoring] = useState(false);

  useEffect(() => {
    const unsubscribe = eventService.on('config_progress', (data) => {
      setProgressMap(prev => ({ ...prev, [data.macAddress]: data.progress }));
      setStatusMap(prev => ({ ...prev, [data.macAddress]: data.status }));
    });

    return unsubscribe;
  }, []);

  const handleRestore = async () => {
    if (devices.length === 0 || isRestoring) return;

    const filteredDevices = devices.filter(d => !successfulDevices.has(d.macAddress));
    setDevices(filteredDevices);

    setIsRestoring(true);
    setProgressMap({});
    setStatusMap({});
    setSuccessfulDevices(new Set());

    await Promise.allSettled(filteredDevices.map(async (device) => {
      return deviceService.restoreConfig(device.macAddress).then(
        () => {
          setSuccessfulDevices(prev => new Set(prev).add(device.macAddress));
          setStatusMap(prev => ({ ...prev, [device.macAddress]: "Completed" }));
          setProgressMap(prev => ({ ...prev, [device.macAddress]: 100 }));
          deviceService.getDevice(device.macAddress).then(updated => {
            setDevices(prev => prev.map(d => d.macAddress === updated.macAddress ? updated : d));
          });
        },
        (err) => {
          setStatusMap(prev => ({ ...prev, [device.macAddress]: "Failed" }));
          notify.error("Config restore failed", `Failed to restore config for ${device.name}. ${err.message || err}`);
        })
    }));
    setIsRestoring(false);
  };

  const handleClose = () => {
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
          <Alert variant="warning">No device chosen for config restore.</Alert>
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

        {(isRestoring && (
          <div className="text-center">
            <Spinner animation="border" role="status">
              <span className="visually-hidden">Restoring...</span>
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
          This will find the previously exported config file for the device and restore it.
        </small>
        <div className="d-flex gap-1">
          <Button
            variant="secondary"
            onClick={handleClose}
            disabled={isRestoring}
          >
            Close
          </Button>

          {successfulDevices.size < devices.length && (
            <Button
              variant="netio"
              onClick={handleRestore}
              disabled={devices.length === 0 || isRestoring}
            >
              {(isRestoring && (
                <>
                  <Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" className="me-2" />
                  Restoring...
                </>
              )) || (Object.values(statusMap).some(status => status === "Failed") && "Retry Failed")
                || (
                  'Start restore'
                )}
            </Button>
          )}
        </div>
      </div>
    </>
  );

  if (embedded) return content;

  return (
    <Modal show={show} onHide={handleClose} backdrop={isRestoring ? 'static' : true} centered size="lg">
      <Modal.Header closeButton={isRestoring}>
        <Modal.Title>Configuration Restore</Modal.Title>
      </Modal.Header>
      {content}
    </Modal>
  );
};
