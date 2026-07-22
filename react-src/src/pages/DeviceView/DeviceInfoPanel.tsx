import React from "react";
import { Card, Table } from "react-bootstrap";

/** Convert camelCase / snake_case keys to readable labels */
function humanizeKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2") // camelCase → camel Case
    .replace(/[_-]/g, " ")                    // snake_case → snake case
    .replace(/\b\w/g, (c) => c.toUpperCase()); // capitalize words
}

function isPrimitive(value: unknown): value is string | number | boolean | null | undefined {
  return value === null || value === undefined || typeof value !== "object";
}

function formatValue(value: unknown): React.ReactNode {
  if (value === null || value === undefined) return <span className="text-muted">—</span>;
  if (typeof value === "boolean") return <span style={{ color: value ? "#69b72b" : "#dc3545" }}>{value ? "true" : "false"}</span>;
  if (typeof value === "number") return <span>{value.toLocaleString()}</span>;
  return <span>{String(value)}</span>;
}

/** Render a value cell — primitives inline, objects/arrays recursively */
function renderValue(value: unknown): React.ReactNode {
  if (isPrimitive(value)) return formatValue(value);
  if (Array.isArray(value)) return <InfoArray items={value} />;
  if (typeof value === "object" && value !== null) {
    return <InfoTable data={value as Record<string, unknown>} />;
  }
  return formatValue(value);
}

/** Render a key/value table, recursing into nested objects and arrays */
function InfoTable({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data);
  if (entries.length === 0) return null;

  return (
    <Table size="sm" borderless className="info-table mb-0">
      <tbody>
        {entries.map(([key, value]) => (
          <tr key={key}>
            <td className="info-key">{humanizeKey(key)}</td>
            <td className="info-value">{renderValue(value)}</td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

/** Render a section (card) for a nested object */
function InfoSection({ title, data }: { title: string; data: Record<string, unknown> }) {
  const primitiveEntries = Object.entries(data).filter(([, v]) => isPrimitive(v));
  const objectEntries = Object.entries(data).filter(([, v]) => !isPrimitive(v) && !Array.isArray(v) && typeof v === "object");
  const arrayEntries = Object.entries(data).filter(([, v]) => Array.isArray(v));

  return (
    <Card className="info-section mb-3">
      <Card.Header className="info-section-header">{humanizeKey(title)}</Card.Header>
      <Card.Body className="py-2 px-3">
        {primitiveEntries.length > 0 && (
          <InfoTable data={Object.fromEntries(primitiveEntries)} />
        )}
        {arrayEntries.map(([key, value]) => (
          <div key={key} className="mt-2">
            <strong className="info-key">{humanizeKey(key)}</strong>
            <InfoArray items={value as unknown[]} />
          </div>
        ))}
        {objectEntries.map(([key, value]) => (
          <InfoSection key={key} title={key} data={value as Record<string, unknown>} />
        ))}
      </Card.Body>
    </Card>
  );
}

/** Render an array – either as a list of primitives or a set of sub-sections */
function InfoArray({ items }: { items: unknown[] }) {
  if (items.length === 0) return <span className="text-muted">Empty</span>;

  // Primitive array → comma-separated badges
  if (items.every(isPrimitive)) {
    return (
      <div className="d-flex flex-wrap gap-1 mt-1">
        {items.map((item, i) => (
          <span key={i} className="badge bg-secondary">{formatValue(item)}</span>
        ))}
      </div>
    );
  }

  // Array of objects → render each as a mini table
  return (
    <div className="mt-1">
      {items.map((item, i) => (
        <Card key={i} className="info-array-item mb-2">
          <Card.Body className="py-2 px-3">
            {renderValue(item)}
          </Card.Body>
        </Card>
      ))}
    </div>
  );
}

/**
 * Preferred display order for top-level info sections.
 * Keys not listed here will be appended at the end in their original order.
 */
const SECTION_ORDER: string[] = [
  "deviceName",
  "systemInfo",
  "version",
  "features",
  "outputList",
  "outputDetails",
  "outputMeasure",
  "outputGlobalMeasure",
  "outputStatus",
  "inputDetails",
  "inputList",
  "protocolsInfo",
  "schedulesList",
  "userList",
  "wdtList",
  "watchdogList",
  "rulesList",
  "pabList",
];

/** Sort entries by the predefined order, unknown keys go to the end */
function sortEntries(entries: [string, unknown][]): [string, unknown][] {
  return [...entries].sort((a, b) => {
    const idxA = SECTION_ORDER.indexOf(a[0]);
    const idxB = SECTION_ORDER.indexOf(b[0]);
    // Both known → sort by defined order
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    // Only one known → known comes first
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    // Both unknown → keep original order
    return 0;
  });
}

interface DeviceInfoPanelProps {
  info: Record<string, unknown> | null;
}

export const DeviceInfoPanel: React.FC<DeviceInfoPanelProps> = ({ info }) => {
  if (!info) return null;

  const allEntries = sortEntries(Object.entries(info));

  const primitiveEntries = allEntries.filter(([, v]) => isPrimitive(v));
  const objectEntries = allEntries.filter(([, v]) => !isPrimitive(v) && !Array.isArray(v) && typeof v === "object" && v !== null);
  const arrayEntries = allEntries.filter(([, v]) => Array.isArray(v));

  return (
    <div className="device-info-panel d-flex flex-wrap gap-3">
      {/* Top-level flat fields */}
      {primitiveEntries.length > 0 && (
        <Card className="info-section mb-3">
          <Card.Header className="info-section-header">General</Card.Header>
          <Card.Body className="py-2 px-3">
            <InfoTable data={Object.fromEntries(primitiveEntries)} />
          </Card.Body>
        </Card>
      )}

      {/* Nested object sections */}
      {objectEntries.map(([key, value]) => (
        <InfoSection key={key} title={key} data={value as Record<string, unknown>} />
      ))}

      {/* Top-level arrays */}
      {arrayEntries.map(([key, value]) => (
        <div key={key} className="mb-3">
          <h6 className="info-key">{humanizeKey(key)}</h6>
          <InfoArray items={value as unknown[]} />
        </div>
      ))}
    </div>
  );
};
