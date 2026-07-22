import React from "react";
import Stack from "react-bootstrap/esm/Stack";
import Form from "react-bootstrap/esm/Form";
import "./FilterBar.css";

interface FilterBarProps {
  filterText: string;
  preChildren?: React.ReactNode;
  children?: React.ReactNode;
  chooseItems: boolean;
  setChooseAll: (checked: boolean) => void;
  chooseAll: boolean;
}

export const FilterBar: React.FC<FilterBarProps> = (props: FilterBarProps) => {
  if (props.filterText !== "") {
    return (
      <Stack className="filter-bar" direction="horizontal" gap={3}>
        {props.chooseItems && (
          <Form.Check
            className="me-2 mb-0 anim-enter-right"
            type="checkbox"
            checked={props.chooseAll}
            onChange={(e) => props.setChooseAll(e.target.checked)}
            aria-label="Choose All"
          />
        )}
        {props.preChildren}
        <span>{props.filterText}</span>

        <div className="vr ms-auto" />
        <div
          className="controls d-flex gap-1 anim-enter-left"
          key={props.chooseItems ? "multi-select" : "single-select"}
        >
          {props.children}
        </div>
      </Stack>
    );
  } else {
    return null;
  }
}