import type { NumberFormat } from "../model.ts";

export function formatNumber(value: number, format: NumberFormat = {}): string {
  const number =
    format.decimals === undefined
      ? String(value)
      : value.toFixed(format.decimals);
  const [integer, fraction] = number.split(".");
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${format.prefix ?? ""}${grouped}${fraction === undefined ? "" : `.${fraction}`}${format.suffix ?? ""}`;
}
