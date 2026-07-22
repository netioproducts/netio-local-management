import React, { useEffect, useState } from "react";
import { Col, Container, Row } from "react-bootstrap";
import Sidebar from "../../components/Sidebar/Sidebar";
import SocketCard from "../../components/SocketCard/SocketCard";
import { getSocketsByDeviceGroup, getSocketsInGroup, handleTopButtonClick, toggleSocket } from "./SocketListService";
import { deviceService } from "../../services/deviceService";
import { Group } from "../../models/Group";
import "./SocketList.css";
import { Socket, SocketId } from "../../models/Socket";
import { handleLoadingAction } from "../../utils/asyncUtils";
import { Device } from "../../models/Device";
import { FilterBar } from "../../components/FilterBar/FilterBar";
import { DropdownItem, IconButton, IconDropdownButton } from "../../components/IconButton";
import { RiRemoteControl2Fill, RiRemoteControl2Line, RiSettings4Fill } from "react-icons/ri";
import { LuGroup, LuUngroup } from "react-icons/lu";

export const SocketList: React.FC = () => {
  const [socketGroups, setSocketGroups] = useState<Group[]>([]);
  const [deviceGroups, setDeviceGroups] = useState<Group[]>([]);
  const [loadingGroups, setLoadingGroups] = useState<boolean>(true);

  const [sockets, setSockets] = useState<Socket[]>([]);
  const [pendingSockets, setPendingSockets] = useState<Set<SocketId>>(new Set());

  const [filterText, setFilterText] = useState<string>("");
  const [selectedSockets, setSelectedSockets] = useState<Set<SocketId>>(new Set());

  function loadCategories() {
    let mounted = true;

    handleLoadingAction<Group[]>({
      checkMounted: () => mounted,
      onLoaded: setSocketGroups,
      setLoading: setLoadingGroups
    }, deviceService.getSocketGroups);

    handleLoadingAction<Group[]>({
      checkMounted: () => mounted,
      onLoaded: setDeviceGroups,
      setLoading: setLoadingGroups
    }, deviceService.getDeviceGroups);

    return () => {
      mounted = false;
    };
  }

  useEffect(() => {
    loadCategories();
  }, []);

  async function handleSocketGroupClick(group: Group) {
    let mounted = true;
    setFilterText(group.name);
    setSelectedSockets(new Set());

    handleLoadingAction<Socket[]>({
      onLoaded: setSockets,
      checkMounted: () => mounted
    }, () => getSocketsInGroup(group.id));
    return () => { mounted = false; };
  }

  async function handleDeviceGroupClick(group: Group) {
    let mounted = true;
    setFilterText(group.name);
    setSelectedSockets(new Set());

    handleLoadingAction<Device[]>({
      onLoaded: (devices) => setSockets(devices.flatMap(device => device.sockets.map(socket => ({ ...socket })))),
      checkMounted: () => mounted
    }, () => getSocketsByDeviceGroup(group.id));
    return () => { mounted = false; };
  }

  const handleToggle = async (id: SocketId, newState?: boolean): Promise<void> => {
    setPendingSockets(prev => new Set(prev).add(id));
    try {
      await toggleSocket(id, setSockets, newState);
    } finally {
      setPendingSockets(prev => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
      });
    }
  };

  const handleToggleMultiple = async (ids: SocketId[], newState?: boolean): Promise<void> => {
    await Promise.all(ids.map(async id => {
      setPendingSockets(prev => new Set(prev).add(id));
      try {
        return await toggleSocket(id, setSockets, newState);
      } finally {
        setPendingSockets(prev_1 => {
          const newSet = new Set(prev_1);
          newSet.delete(id);
          return newSet;
        });
      }
    }));
  };

  const toggleSelectSocket = (id: SocketId) => {
    setSelectedSockets((prevSelected) => {
      const newSelected = new Set(prevSelected);
      if (newSelected.has(id)) {
        newSelected.delete(id);
      } else {
        newSelected.add(id);
      }
      return newSelected;
    });
  };

  const handleChooseAllChange = (checked: boolean) => {
    if (checked) {
      setSelectedSockets(new Set(sockets.map((socket) => socket.id)));
    } else {
      setSelectedSockets(new Set());
    }
  };

  return (
    <div className="d-flex w-100">
      <Sidebar>
        <Sidebar.TopButton
          name="Search"
          func={() => { handleTopButtonClick(); loadCategories(); }}
        />
        <Sidebar.CollapsibleItem title="Socket Groups">
          {loadingGroups ? (
            <div className="p-2">Loading…</div>
          ) : (
            socketGroups.map((group) => (
              <Sidebar.GroupButton key={group.name} onClick={() => { handleSocketGroupClick(group); }}>{group.name}</Sidebar.GroupButton>
            ))
          )}
        </Sidebar.CollapsibleItem>
        <Sidebar.CollapsibleItem title="Device Groups">
          {loadingGroups ? (
            <div className="p-2">Loading…</div>
          ) : (
            deviceGroups.map((group) => (
              <Sidebar.GroupButton key={group.name} onClick={() => { handleDeviceGroupClick(group); }}>{group.name}</Sidebar.GroupButton>
            ))
          )}
        </Sidebar.CollapsibleItem>
      </Sidebar>

      <Container fluid className="main-list">
        <FilterBar
          filterText={filterText}
          chooseItems={selectedSockets.size > 0}
          chooseAll={selectedSockets.size === sockets.length}
          setChooseAll={handleChooseAllChange}
        >
          {!(selectedSockets.size > 0) ? (
            <>
              <IconDropdownButton
                title="Control whole group"
                icon={<RiRemoteControl2Fill />}
                items={[
                  <DropdownItem onClick={() => { handleToggleMultiple(sockets.map(socket => socket.id), true) }}>Turn all on</DropdownItem>,
                  <DropdownItem onClick={() => { handleToggleMultiple(sockets.map(socket => socket.id), false) }}>Turn all off</DropdownItem>,
                  <DropdownItem onClick={() => { handleToggleMultiple(sockets.map(socket => socket.id)) }}>Toggle all</DropdownItem>,
                ]}
              />
              <IconButton
                onClick={() => { }}
                title="Group settings"
                icon={<RiSettings4Fill />}
              />
            </>
          ) : (
            <>
              <IconDropdownButton
                title="Control selected"
                icon={<RiRemoteControl2Line />}
                items={[
                  <DropdownItem onClick={() => { handleToggleMultiple(Array.from(selectedSockets), true) }}>Turn selected on</DropdownItem>,
                  <DropdownItem onClick={() => { handleToggleMultiple(Array.from(selectedSockets), false) }}>Turn selected off</DropdownItem>,
                  <DropdownItem onClick={() => { handleToggleMultiple(Array.from(selectedSockets)) }}>Toggle selected</DropdownItem>,
                ]}
              />
              <IconButton
                onClick={() => { }}
                title="Insert selected into group"
                icon={<LuGroup />}
              />
              <IconButton
                onClick={() => { }}
                title="Remove selected from group"
                icon={<LuUngroup />}
              />
            </>
          )}
        </FilterBar >
        <Row>
          {sockets.map((socket) => (
            <Col key={socket.id[0] + '-' + socket.id[1]} md="auto">
              <SocketCard
                socket={socket}
                toggleFunction={handleToggle}
                selected={selectedSockets.has(socket.id)}
                toggleSelected={() => toggleSelectSocket(socket.id)}
                isPending={pendingSockets.has(socket.id)} />
            </Col>
          ))}
        </Row>
      </Container>
    </div>
  );
};