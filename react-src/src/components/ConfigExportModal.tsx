import React, { useState } from 'react';
import { Modal, Button, ListGroup, Alert, Spinner } from 'react-bootstrap';
import { Device } from '../models/Device';
import { deviceService } from '../services/deviceService';
import { RxExclamationTriangle, RxCheckCircled, RxCrossCircled } from "react-icons/rx";
import { notify } from '../services/notificationService';

interface ConfigExportModalProps {
  show: boolean;
  onHide: () => void;
  selectedDevices: Device[];
  embedded?: boolean;
}

export const ConfigExportModal: React.FC<ConfigExportModalProps> = ({
  show,
  onHide,
  selectedDevices,
  embedded
}) => {
  const [devices, setDevices] = useState<Device[]>(selectedDevices);
  const [statusMap, setStatusMap] = useState<Record<string, string>>({});
  const [successfulDevices, setSuccessfulDevices] = useState<Set<string>>(new Set());
  const [isExporting, setIsExporting] = useState(false);
  const [exportedPaths, setExportedPaths] = useState<Set<string>>(new Set());

  const handleExport = async () => {
    if (devices.length === 0 || isExporting) return;

    const filteredDevices = devices.filter(d => !successfulDevices.has(d.macAddress));
    setDevices(filteredDevices);

    setIsExporting(true);
    setStatusMap({});
    setSuccessfulDevices(new Set());
    setExportedPaths(new Set());

    await Promise.allSettled(filteredDevices.map(async (device) => {
      setStatusMap(prev => ({ ...prev, [device.macAddress]: "Exporting..." }));
      return deviceService.exportConfig(device.macAddress).then(
        (res) => {
          setSuccessfulDevices(prev => new Set(prev).add(device.macAddress));
          setStatusMap(prev => ({ ...prev, [device.macAddress]: `Exported as ${res.filePath.split('/').pop()}` }));
          setExportedPaths(prev => new Set(prev).add(res.filePath.split('/').slice(0, -1).join('/') || ''));
        },
        (err) => {
          setStatusMap(prev => ({ ...prev, [device.macAddress]: "Failed" }));
          notify.error("Config export failed", `Failed to export config from ${device.name}. ${err}`);
        })
    }));
    setIsExporting(false);
  };

  const handleClose = () => {
    setStatusMap({});
    setSuccessfulDevices(new Set());
    setExportedPaths(new Set());
    onHide();
  };

  const content = (
    <>
      <div className="modal-body">
        <h6 className="mb-3">Devices ({devices.length}):</h6>
        {devices.length === 0 ? (
          <Alert variant="warning">No device chosen for config export.</Alert>
        ) : (
          <ListGroup className="mb-4" style={{ maxHeight: '150px', overflowY: 'auto' }}>
            {devices.map((device) => {
              const currentStatus = statusMap[device.macAddress] || '';
              return (
                <ListGroup.Item key={device.macAddress} className="d-flex justify-content-between align-items-center gap-1">
                  <div className="text-nowrap">{device.name}</div>
                  <div className="text-nowrap text-muted">{device.fwVersion}</div>
                  <div className="flex-grow-1 text-end px-3">
                    <span className={currentStatus === 'Failed' ? 'text-danger' : ''}>
                      {currentStatus}
                    </span>
                  </div>
                </ListGroup.Item>
              )
            })}
          </ListGroup>
        )}

        {exportedPaths.size > 0 && (
          <div className="m-3">
            <span>
              Configs exported to:
            </span>
            <div style={{ maxHeight: '100px', overflowY: 'auto', fontSize: '0.85em' }}>
              {Array.from(exportedPaths).map((p, i) => <div key={i}>{p}</div>)}
            </div>
          </div>
        )}

        {(isExporting && (
          <div className="text-center">
            <Spinner animation="border" role="status">
              <span className="visually-hidden">Exporting...</span>
            </Spinner>
          </div>
        )) || Object.values(statusMap).length === 0
          || (Object.values(statusMap).every(status => status.startsWith("Exported as")) && (
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
        <div className="d-flex gap-1">
          <Button
            variant="secondary"
            onClick={handleClose}
            disabled={isExporting}
          >
            Close
          </Button>

          {successfulDevices.size < devices.length && (
            <Button
              variant="netio"
              onClick={handleExport}
              disabled={devices.length === 0 || isExporting}
            >
              {(isExporting && (
                <>
                  <Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" className="me-2" />
                  Exporting...
                </>
              )) || (Object.values(statusMap).some(status => status === "Failed") && "Retry Failed")
                || (
                  'Start export'
                )}
            </Button>
          )}
        </div>
      </div>
    </>
  );

  if (embedded) return content;

  return (
    <Modal show={show} onHide={handleClose} backdrop={isExporting ? 'static' : true} centered size="lg">
      <Modal.Header closeButton={isExporting}>
        <Modal.Title>Configuration Export</Modal.Title>
      </Modal.Header>
      {content}
    </Modal>
  );
};
