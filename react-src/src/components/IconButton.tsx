import { Button, Dropdown } from "react-bootstrap";

interface IconButtonProps {
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  title?: string;
}

export const IconButton: React.FC<IconButtonProps> = (props: IconButtonProps) => {
  return (
    <Button
      variant="outline-netio"
      className={`icon-button ${props.className ? props.className : ''}`}
      onClick={props.onClick}
      disabled={props.disabled}
      title={props.title}
    >
      {props.icon}
    </Button>
  );
}

interface IconDropdownButtonProps {
  icon: React.ReactNode;
  disabled?: boolean;
  className?: string;
  title?: string;
  items?: React.ReactNode[];
}

export const IconDropdownButton: React.FC<IconDropdownButtonProps> = (props: IconDropdownButtonProps) => {
  return (
    <Dropdown>
      <Dropdown.Toggle
        variant="outline-netio"
        className={`icon-button ${props.className ? props.className : ''}`}
        disabled={props.disabled}
        title={props.title}
      >
        {props.icon}
      </Dropdown.Toggle>
      <Dropdown.Menu>
        {props.items}
      </Dropdown.Menu>
    </Dropdown>
  );
}

export const DropdownItem: React.FC<React.PropsWithChildren<{ onClick: () => void }>> = (props) => {
  return (
    <Dropdown.Item onClick={props.onClick}>
      {props.children}
    </Dropdown.Item>
  );
}
