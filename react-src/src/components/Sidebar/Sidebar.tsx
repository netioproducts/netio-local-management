import React, { JSX, useState } from "react";
import Accordion from "react-bootstrap/Accordion";
import Button from "react-bootstrap/Button";
import "./Sidebar.css";
import { createLogger } from "../../services/logger";

const log = createLogger("Sidebar");

interface SidebarProps {
  children: React.ReactNode;
}

interface CollapsibleItemProps {
  title: string;
  children: React.ReactNode;
}

const CollapsibleItem = ({ title, children }: CollapsibleItemProps): JSX.Element => {
  return (
    <Accordion.Item eventKey={title} className="sidebar-collapsible-item">
      <Accordion.Header>
        {title}
      </Accordion.Header>
      <Accordion.Body className="d-grid gap-0">
        {children}
      </Accordion.Body>
    </Accordion.Item>
  );
}

const GroupButton = ({ children, onClick }: { children: React.ReactNode, onClick?: () => void }): JSX.Element => {
  return (
    <Button variant="secondary" className="sidebar-group-button" onClick={onClick}>
      {children}
    </Button>
  );
};

type TopButtonProps = {
  name: string;
  func: () => Promise<unknown> | void;
};

const TopButton = ({ name, func }: TopButtonProps): JSX.Element => {
  const [loading, setLoading] = useState<boolean>(false);

  const onClickHandler = async () => {
    if (loading) return;
    try {
      setLoading(true);
      await func();
    }
    catch (err) {
      // The action reports its errors itself, this only keeps the button usable
      log.debug("Top button action failed", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant="netio" className="sidebar-top-button" onClick={onClickHandler} disabled={loading}>
      {loading ? "Loading..." : name}
    </Button>
  );
};

type SidebarComponent = React.FC<SidebarProps> & {
  CollapsibleItem: typeof CollapsibleItem;
  GroupButton: typeof GroupButton;
  TopButton: typeof TopButton;
};

const Sidebar: SidebarComponent = ({ children }: SidebarProps) => {
  return (
    <Accordion className="sidebar">
      {children}
    </Accordion>
  );
};

Sidebar.CollapsibleItem = CollapsibleItem;
Sidebar.GroupButton = GroupButton;
Sidebar.TopButton = TopButton;

export default Sidebar;
