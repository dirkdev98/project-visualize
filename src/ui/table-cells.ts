import type { Cell, DataRow, TableColumn, Tone } from "../model.ts";
import {
  changeTone,
  formatRange,
  relativeChange,
  signedPercent,
} from "./change-text.ts";
import { formatNumber } from "./number-format.ts";

/** What a table cell shows, shared by the viewer and HTML so both agree. */
export interface CellView {
  text: string;
  /** Secondary text after `text`, such as a change or an interval. */
  note?: string;
  noteTone?: Tone;
  /** Draw the text as a status badge in this tone. */
  status?: Tone;
}

export function cellValue(row: DataRow, key: string): Cell {
  return Object.hasOwn(row, key) ? row[key] : null;
}

function plain(value: Cell): string {
  return value === null
    ? ""
    : typeof value === "string"
      ? value
      : JSON.stringify(value);
}

function number(value: Cell, row: DataRow, column: TableColumn): string {
  if (typeof value !== "number") return plain(value);
  const unit = column.unit ? plain(cellValue(row, column.unit)) : "";
  return `${formatNumber(value, column.format)}${unit ? ` ${unit}` : ""}`;
}

export function statusTone(column: TableColumn, value: Cell): Tone {
  const label = plain(value);
  return value !== null && column.tones && Object.hasOwn(column.tones, label)
    ? column.tones[label]
    : "neutral";
}

export function tableCell(row: DataRow, column: TableColumn): CellView {
  const value = cellValue(row, column.key);
  switch (column.kind) {
    case "change": {
      const from = cellValue(row, column.from ?? "");
      if (typeof from !== "number") return { text: number(value, row, column) };
      const change = relativeChange(from, value);
      return {
        text: `${formatNumber(from, column.format)} → ${number(value, row, column)}`,
        ...(change === undefined
          ? {}
          : {
              note: signedPercent(change),
              noteTone: changeTone(change, column.better),
            }),
      };
    }
    case "interval": {
      const low = cellValue(row, column.low ?? ""),
        high = cellValue(row, column.high ?? "");
      if (typeof low !== "number" || typeof high !== "number")
        return { text: number(value, row, column) };
      return {
        text: number(value, row, column),
        note: formatRange(low, high, column.format),
      };
    }
    case "status":
      return value === null
        ? { text: "" }
        : { text: plain(value), status: statusTone(column, value) };
    default:
      return { text: number(value, row, column) };
  }
}

/** Sort changes by their relative change and other columns by their value. */
export function sortValue(row: DataRow, column: TableColumn): Cell {
  const value = cellValue(row, column.key);
  if (column.kind === "change")
    return (
      relativeChange(cellValue(row, column.from ?? ""), value) ??
      (typeof value === "number" ? value : null)
    );
  return value;
}

export function compareCells(x: Cell, y: Cell): number {
  if (x === null) return y === null ? 0 : 1;
  if (y === null) return -1;
  return typeof x === "number" && typeof y === "number"
    ? x - y
    : plain(x).localeCompare(plain(y), "en");
}

export function searchText(row: DataRow, column: TableColumn): string {
  const view = tableCell(row, column);
  return `${view.text} ${view.note ?? ""} ${plain(cellValue(row, column.key))}`;
}

/** Counts each status in order of first appearance. */
export function statusSummary(
  rows: DataRow[],
  column: TableColumn,
): { label: string; tone: Tone; count: number }[] {
  const counts = new Map<
    string,
    { label: string; tone: Tone; count: number }
  >();
  for (const row of rows) {
    const value = cellValue(row, column.key);
    if (value === null) continue;
    const label = plain(value);
    const entry = counts.get(label) ?? {
      label,
      tone: statusTone(column, value),
      count: 0,
    };
    entry.count++;
    counts.set(label, entry);
  }
  return [...counts.values()];
}
