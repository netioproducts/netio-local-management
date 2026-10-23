import React, { useState } from 'react';
import { Modal, Button, ListGroup, Alert, Spinner } from 'react-bootstrap';
import { deviceService } from '../services/deviceService';
import { notify, notifyError } from '../services/notificationService';
import { RxExclamationTriangle, RxCheckCircled, RxCrossCircled } from "react-icons/rx";

interface FactoryResetModalProps {
  show: boolean;
  onHide: () => void;
  selectedDevices: string[];
  onResetComplete: () => void;
}

export const FactoryResetModal: React.FC<FactoryResetModalProps> = ({
  show,
  onHide,
  selectedDevices,
  onResetComplete
}) => {
  const [isResetting, setIsResetting] = useState(false);
  const [statusMap, setStatusMap] = useState<Record<string, string>>({});

  const handleReset = async () => {
    if (selectedDevices.length === 0 || isResetting) return;

    setIsResetting(true);
    setStatusMap({});

    let hasErrors = false;

    await Promise.allSettled(selectedDevices.map(async (macAddress) => {
      setStatusMap(prev => ({ ...prev, [macAddress]: "Resetting..." }));
      try {
        await deviceService.factoryReset(macAddress);
        setStatusMap(prev => ({ ...prev, [macAddress]: "Completed" }));
        notify.success("Successful", `Device ${macAddress} factory reset`);
      } catch (err) {
        setStatusMap(prev => ({ ...prev, [macAddress]: "Failed" }));
        notifyError(`Factory reset failed: ${macAddress}`, err);
        hasErrors = true;
      }
    }));

    setIsResetting(false);

    if (!hasErrors) {
      onResetComplete();
    }
  };

  const handleClose = () => {
    if (!isResetting) {
      setStatusMap({});
      onHide();
    }
  };

  return (
    <Modal show={show} onHide={handleClose} backdrop={isResetting ? 'static' : true} centered size="lg">
      <Modal.Header closeButton={!isResetting}>
        <Modal.Title className="text-danger">
          <RxExclamationTriangle className="me-2 mb-1" />
          Factory Reset Confirmation
        </Modal.Title>
      </Modal.Header>

      <Modal.Body>
        <Alert variant="danger">
          <strong>Warning:</strong> This action will permanently erase all settings on the selected devices and restore them to their factory defaults. This action cannot be undone.
        </Alert>

        <h6 className="mb-3">Devices to be reset ({selectedDevices.length}):</h6>
        {selectedDevices.length === 0 ? (
          <Alert variant="warning">No device chosen for factory reset.</Alert>
        ) : (
          <ListGroup className="mb-4" style={{ maxHeight: '150px', overflowY: 'auto' }}>
            {selectedDevices.map((macAddress) => {
              const currentStatus = statusMap[macAddress] || '';
              return (
                <ListGroup.Item key={macAddress} className="d-flex justify-content-between align-items-center gap-1">
                  <div className="text-nowrap text-muted">{macAddress}</div>
                  <div className="flex-grow-1 text-end">
                    {currentStatus === "Resetting..." && <Spinner animation="border" size="sm" className="text-primary me-2" />}
                    {currentStatus === "Completed" && <RxCheckCircled className="text-success me-2" />}
                    {currentStatus === "Failed" && <RxCrossCircled className="text-danger me-2" />}
                    <span className={
                      currentStatus === "Failed" ? "text-danger fw-bold" :
                        currentStatus === "Completed" ? "text-success fw-bold" :
                          currentStatus === "Resetting..." ? "text-primary fw-bold" : "text-muted"
                    }>
                      {currentStatus}
                    </span>
                  </div>
                </ListGroup.Item>
              )
            })}
          </ListGroup>
        )}
      </Modal.Body>

      <Modal.Footer className="flex-col">
        <div className="d-flex w-100 justify-content-end gap-2">
          <Button
            variant="secondary"
            onClick={handleClose}
            disabled={isResetting}
          >
            {Object.values(statusMap).length > 0 ? "Close" : "Cancel"}
          </Button>

          {Object.values(statusMap).length === 0 && (
            <Button
              variant="danger"
              onClick={handleReset}
              disabled={selectedDevices.length === 0 || isResetting}
            >
              {(isResetting && (
                <>
                  <Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" className="me-2" />
                  Resetting...
                </>
              )) || (
                  'Confirm Factory Reset'
                )}
            </Button>
          )}
        </div>
      </Modal.Footer>
    </Modal>
  );
};
