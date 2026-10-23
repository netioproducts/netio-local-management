import React, { useEffect, useMemo, useState } from "react";
import { Container, Spinner } from "react-bootstrap";
import Sidebar from "../../components/Sidebar/Sidebar";
import {
  toggleDeviceSocket,
  handleTopButtonClick,
  handleLogin,
  handleMultipleLogin,
} from "./DeviceListService";
import { deviceService } from "../../services/deviceService";
import { appService } from "../../services/appSerivce";
import { Group } from "../../models/Group";
import { User } from "../../models/User";
import "./DeviceList.css";
import { DeviceCard, DeviceCardPlaceholder, DeviceCardCompact, DeviceCardCompactPlaceholder } from "../../components/DeviceCard/DeviceCard";
import { useCompactMode } from "../../context/CompactModeContext";
import { Device } from "../../models/Device";
import { Socket, SocketId } from "../../models/Socket";
import { handleLoadingAction } from "../../utils/asyncUtils";
import { FilterBar } from "../../components/FilterBar/FilterBar";
import { LuGroup, LuUngroup } from "react-icons/lu";
import { DropdownItem, IconButton, IconDropdownButton } from "../../components/IconButton";
import { RiAlarmWarningLine, RiRemoteControl2Fill, RiRemoteControl2Line } from "react-icons/ri";
import { notify, notifyError } from "../../services/notificationService";
import { GrUpdate, GrSelect, GrStatusWarning } from "react-icons/gr";
import { FiLogIn, FiSettings } from "react-icons/fi";
import { FirmwareUploadModal } from "../../components/FirmwareUploadModal";
import { ConfigManagementModal } from "../../components/ConfigManagementModal";
import { FactoryResetModal } from "../../components/FactoryResetModal";
import { eventService } from "../../services/eventService";
import { createLogger } from "../../services/logger";

const log = createLogger("DeviceList");
import {
  applyDeviceBusyUpdate,
  applyDeviceStatusUpdate,
  mergeDeviceWithSocketPreserve,
} from "../../utils/deviceStateUtils";

export const DeviceList: React.FC = () => {
  const { compactMode } = useCompactMode();
  const [deviceGroups, setDeviceGroups] = useState<Group[]>([]);
  const [loadingCategories, setLoadingCategories] = useState<boolean>(true);
  const [loadingGroup, setLoadingGroup] = useState<number | null>(null);

  const [devices, setDevices] = useState<Device[]>([]);
  const [pendingDevices, setPendingDevices] = useState<Set<string>>(new Set());
  const [selectedDevices, setSelectedDevices] = useState<Set<string>>(new Set());
  const [loadedGroup, setLoadedGroup] = useState<Group>({ id: -2, name: "" });

  const [users, setUsers] = useState<User[]>([]);
  const [updateModalOpen, setUpdateModalOpen] = useState(false);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [resetModalOpen, setResetModalOpen] = useState(false);

  const abortControllerRef = React.useRef<AbortController | null>(null);

  const loadUsers = async () => {
    try {
      const data = await appService.getUsers();
      setUsers(data);
    } catch (err) {
      notifyError("Failed to load users", err);
    }
  };

  const loadCategories = async () => {
    let mounted = true;
    await handleLoadingAction<Group[]>({
      checkMounted: () => mounted,
      onLoaded: setDeviceGroups,
      onError: (err) => notifyError("Failed to load device groups", err),
      setLoading: setLoadingCategories
    }, deviceService.getDeviceGroups).catch(() => { });
    return () => { mounted = false; };
  };

  const visibleDeviceMacs = useMemo(() => { // Ensure update only when devices mac list change
    return devices.map(d => d.macAddress).sort().join(',');
  }, [devices]);

  useEffect(() => {
    loadCategories();
    loadUsers();

    const savedGroupStr = sessionStorage.getItem('lastSelectedGroup');
    if (savedGroupStr) {
      try {
        const savedGroup = JSON.parse(savedGroupStr) as Group;
        handleDeviceGroupClick(savedGroup);
      } catch (e) {
        log.warn("Failed to parse saved group from session storage", e);
      }
    }

  }, []);

  useEffect(() => {
    if (!visibleDeviceMacs) return;
    const macAddresses = visibleDeviceMacs.split(',');
    deviceService.subscribeToDeviceUpdates(macAddresses);

    const unsubscribe = eventService.on("device_update", (updatedDevice) => {
      setDevices((prevDevices) =>
        prevDevices.map((device) => applyDeviceStatusUpdate(device, updatedDevice)),
      );
    });

    return () => {
      deviceService.unsubscribeFromDeviceUpdates();
      unsubscribe();
    };
  }, [visibleDeviceMacs]);

  useEffect(() => {
    return eventService.on("device_busy", (busy) => {
      setDevices((prevDevices) =>
        prevDevices.map((device) => applyDeviceBusyUpdate(device, busy)),
      );
    });
  }, []);

  async function handleDeviceGroupClick(group: Group) {
    sessionStorage.setItem('lastSelectedGroup', JSON.stringify(group));

    let getFunction = () => Promise.resolve([] as Device[]);
    if (group.id === -1) {
      getFunction = deviceService.getUngroupedDevices;
    } else if (group.id === -2) {
      getFunction = deviceService.getFoundDevices;
    } else {
      getFunction = () => deviceService.getDevicesInGroup(group.id);
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    const currentController = abortControllerRef.current;

    setDevices([]);
    setSelectedDevices(new Set());
    setLoadedGroup(group);
    let mounted = true;

    await handleLoadingAction<Device[]>({
      setLoading: (l) => setLoadingGroup(l ? group.id : null),
      onLoaded: (data) => {
        if (mounted && !currentController.signal.aborted) {
          setDevices(data);
        }
      },
      onError: (err) => notifyError(`Failed to load devices: ${group.name}`, err),
      checkMounted: () => mounted && !currentController.signal.aborted
    }, () => getFunction()).catch(() => { });
    return () => { mounted = false; };
  }

  async function handleUngroupedDevicesClick() {
    handleDeviceGroupClick({ id: -1, name: "Devices not in any group" });
  }

  async function handleFoundDevicesClick() {
    handleDeviceGroupClick({ id: -2, name: "Found Devices" });
  }

  const handleAddDevicesToGroup = async (group: Group, selectedDevices: Array<string>) => {
    deviceService.addDevicesToGroup(group.id, selectedDevices).then(() => {
      notify.success("Successful", `Device(s) added to group ${group.name}`);
      setDevices((prev) => prev.filter((d) => !selectedDevices.includes(d.macAddress)));
      setSelectedDevices(new Set());
    },
      (err) => {
        notifyError(`Failed to add to group: ${group.name}`, err);
      });
  };

  const handleToggle = async (id: SocketId, newState: boolean): Promise<void> => {
    await toggleDeviceSocket(id, newState, setDevices);
  };

  const handleChooseAllChange = (chooseAll: boolean) => {
    if (chooseAll) {
      setSelectedDevices(new Set(devices.map((d) => d.macAddress)));
    } else {
      setSelectedDevices(new Set());
    }
  };

  const handleToggleMultiple = async (macs: string[], newState?: boolean): Promise<void> => {
    await Promise.all(macs.filter((mac) => devices.some(d => d.macAddress === mac && d.isLoggedIn)).map(async (mac) => {
      setPendingDevices((prev) => new Set(prev).add(mac));
      try {
        const updatedDevice = await deviceService.controlDeviceSockets(mac, newState);
        if (updatedDevice) {
          setDevices((prev) =>
            prev.map((d) =>
              d.macAddress === updatedDevice.macAddress
                ? mergeDeviceWithSocketPreserve(d, updatedDevice)
                : d,
            ),
          );
        }
      }
      catch (err) {
        const device = devices.find((d) => d.macAddress === mac);
        notifyError(`Failed to switch outputs: ${device?.name || mac}`, err);
      }
      finally {
        setPendingDevices((prev) => {
          const newSet = new Set(prev);
          newSet.delete(mac);
          return newSet;
        });
      }
    }));
  };

  const toggleSelected = (mac: string) => {
    setSelectedDevices((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(mac)) {
        newSet.delete(mac);
      } else {
        newSet.add(mac);
      }
      return newSet;
    });
  };

  const handleRemoveFromGroup = async (macs: string[]) => {
    try {
      await deviceService.removeDevicesFromGroup(loadedGroup.id, macs);
      notify.success("Successful", `Device(s) removed from group ${loadedGroup.name}`);
    } catch (err) {
      notifyError(`Failed to remove from group: ${loadedGroup.name}`, err);
      return; // Devices stay in the group, keep them shown
    }
    setDevices((prev) => prev.filter((d) => !macs.includes(d.macAddress)));
    setSelectedDevices((prev) => {
      const newSet = new Set(prev);
      macs.forEach(mac => newSet.delete(mac));
      return newSet;
    });
  };

  const handleLocateSelected = async (macs: string[]) => {
    await deviceService.locateDevices(macs).then(() => {
      notify.success("Successful", `Devices will blink their LEDs for 1 minute, if it is supported.`);
    }, (err) => notifyError("Locate failed", err));
  };

  return (
    <div className="d-flex" style={{ width: "100%" }}>
      <Sidebar>
        <Sidebar.TopButton
          name="Search"
          func={async () => {
            await handleTopButtonClick();
            loadCategories();
            handleFoundDevicesClick();
          }}
        />
        <Sidebar.CollapsibleItem title="Device Groups">
          {loadingCategories ? (
            <div className="p-2">Loading…</div>
          ) : (
            deviceGroups.map((group) => (
              <Sidebar.GroupButton key={group.name} onClick={() => handleDeviceGroupClick(group)}>
                <div className="status-indicator" style={{ minHeight: '24px' }}>
                  <span className="me-1">{group.name}</span>
                  {loadingGroup === group.id ? (
                    <Spinner animation="border" size="sm" role="status">
                      <span className="visually-hidden">Loading...</span>
                    </Spinner>
                  ) : null}
                </div>
              </Sidebar.GroupButton>
            ))
          )}
        </Sidebar.CollapsibleItem>
        <Sidebar.CollapsibleItem title="Other Devices">
          <Sidebar.GroupButton onClick={() => handleUngroupedDevicesClick()}>Devices not in any group</Sidebar.GroupButton>
          <Sidebar.GroupButton onClick={() => handleFoundDevicesClick()}>Found Devices</Sidebar.GroupButton>
        </Sidebar.CollapsibleItem>
      </Sidebar>

      <Container fluid className="main-list">
        <FilterBar
          filterText={loadedGroup.name}
          chooseItems={selectedDevices.size > 0}
          chooseAll={selectedDevices.size === devices.length}
          setChooseAll={handleChooseAllChange}
          preChildren={
            <>
              {(selectedDevices.size > 0) &&
                <span className="group-count">({selectedDevices.size}/{devices.length})</span>
              }
              <IconDropdownButton
                title="Select by FW version"
                icon={<GrSelect />}
                items={Array.from(new Set(devices.map(d => d.fwVersion))).map((version) => (
                  <DropdownItem key={version} onClick={() => {
                    const macsToSelect = devices.filter(d => d.fwVersion === version).map(d => d.macAddress);
                    setSelectedDevices(new Set(macsToSelect));
                  }}>{version}</DropdownItem>
                ))}
              />
            </>
          }
        >
          {(!(selectedDevices.size > 0) && (
            <>
              <IconDropdownButton
                title="Control whole group"
                icon={<RiRemoteControl2Fill />}
                items={[
                  <DropdownItem key="turn-all-on" onClick={() => { handleToggleMultiple(devices.map((d) => d.macAddress), true); }}>Turn all on</DropdownItem>,
                  <DropdownItem key="turn-all-off" onClick={() => { handleToggleMultiple(devices.map((d) => d.macAddress), false); }}>Turn all off</DropdownItem>,
                  <DropdownItem key="toggle-all" onClick={() => { handleToggleMultiple(devices.map((d) => d.macAddress)); }}>Toggle all</DropdownItem>,
                ]}
              />
            </>
          )) || (
              <>
                <IconDropdownButton
                  title="Control selected"
                  icon={<RiRemoteControl2Line />}
                  items={[
                    <DropdownItem key="turn-selected-on" onClick={() => { handleToggleMultiple(Array.from(selectedDevices), true); }}>Turn selected on</DropdownItem>,
                    <DropdownItem key="turn-selected-off" onClick={() => { handleToggleMultiple(Array.from(selectedDevices), false); }}>Turn selected off</DropdownItem>,
                    <DropdownItem key="toggle-selected" onClick={() => { handleToggleMultiple(Array.from(selectedDevices)); }}>Toggle selected</DropdownItem>,
                  ]}
                />
                <IconDropdownButton
                  title="Insert selected into group"
                  icon={<LuGroup />}
                  items={deviceGroups.filter((g) => g.id !== loadedGroup.id).map((group) => (
                    <DropdownItem key={group.id}
                      onClick={() => { handleAddDevicesToGroup(group, Array.from(selectedDevices)); }}>{group.name}</DropdownItem>
                  ))}
                />

                {loadedGroup.id >= 0 && (
                  <IconButton
                    onClick={() => { handleRemoveFromGroup(Array.from(selectedDevices)); }}
                    title="Remove selected from group"
                    icon={<LuUngroup />}
                  />
                )}

                <IconDropdownButton
                  title="Log into selected"
                  icon={<FiLogIn />}
                  items={users.map((user) => (
                    <DropdownItem key={user.name}
                      onClick={() => { handleMultipleLogin(Array.from(selectedDevices), user.name, setDevices); }}>{user.name}</DropdownItem>
                  ))}
                />

                <IconButton
                  onClick={() => { setUpdateModalOpen(true); deviceService.unsubscribeFromDeviceUpdates(); }}
                  title="Update selected firmware"
                  icon={<GrUpdate />}
                />

                <IconButton
                  onClick={() => { setConfigModalOpen(true); deviceService.unsubscribeFromDeviceUpdates(); }}
                  title="Manage configuration for selected"
                  icon={<FiSettings />}
                />

                <IconButton
                  onClick={() => { handleLocateSelected(Array.from(selectedDevices)); }}
                  title="Locate selected"
                  icon={<RiAlarmWarningLine />}
                />

                <IconButton
                  onClick={() => { setResetModalOpen(true); deviceService.unsubscribeFromDeviceUpdates(); }}
                  title="Factory reset selected"
                  icon={<GrStatusWarning />}
                />
              </>
            )}
        </FilterBar >
        {updateModalOpen && (
          <FirmwareUploadModal show={updateModalOpen} onHide={() => { setUpdateModalOpen(false); handleDeviceGroupClick(loadedGroup) }} selectedDevices={Array.from(selectedDevices.values()).map((mac) => devices.find((d) => d.macAddress === mac)).filter((device): device is Device => device !== undefined)} />
        )}
        {configModalOpen && (
          <ConfigManagementModal show={configModalOpen} onHide={() => { setConfigModalOpen(false); handleDeviceGroupClick(loadedGroup) }} selectedDevices={Array.from(selectedDevices.values()).map((mac) => devices.find((d) => d.macAddress === mac)).filter((device): device is Device => device !== undefined)} />
        )}
        {resetModalOpen && (
          <FactoryResetModal show={resetModalOpen} onHide={() => { setResetModalOpen(false); }} selectedDevices={Array.from(selectedDevices.values())} onResetComplete={() => { setResetModalOpen(false); handleDeviceGroupClick(loadedGroup); }} />
        )}

        {
          devices.map((device) => {
            const CardComponent = compactMode ? DeviceCardCompact : DeviceCard;
            return (
              <CardComponent
                key={device.macAddress}
                isPending={pendingDevices.has(device.macAddress)}
                device={device}
                selected={selectedDevices.has(device.macAddress)}
                toggleSelected={() => toggleSelected(device.macAddress)}
                users={users}
                onLogin={(macAddress, userName) => handleLogin(macAddress, userName, setDevices)}
                sockets={(device.sockets || []).map((socket: Socket) => ({
                  socket: socket,
                  toggleFunction: handleToggle
                }))} />
            );
          })
        }
        {
          devices.length === 0 && loadingGroup !== null && (
            compactMode ? (
              <>
                <DeviceCardCompactPlaceholder />
                <DeviceCardCompactPlaceholder />
                <DeviceCardCompactPlaceholder />
              </>
            ) : (
              <>
                <DeviceCardPlaceholder />
                <DeviceCardPlaceholder />
                <DeviceCardPlaceholder />
              </>
            )
          )
        }
      </Container>
    </div>
  );
};