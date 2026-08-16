// Shared formatting helpers for dates and numbers.

const dateFmt = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const shortDateFmt = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
});

export function formatDate(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return dateFmt.format(d);
}

export function formatShortDate(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return shortDateFmt.format(d);
}

const monthFmt = new Intl.DateTimeFormat("en-GB", {
  month: "long",
  year: "numeric",
});

export function formatMonth(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return monthFmt.format(d);
}

const dayFmt = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
});

export function formatDayMonth(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return dayFmt.format(d);
}

/** ISO date (yyyy-mm-dd) for <input type="date"> defaults. */
export function toDateInputValue(iso: string | Date = new Date()): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatNumber(value: number, maxFractionDigits = 1): string {
  return new Intl.NumberFormat("en-GB", {
    maximumFractionDigits: maxFractionDigits,
  }).format(value);
}

export function formatWeight(kg: number): string {
  return `${formatNumber(kg)} kg`;
}

export function formatMeasurement(value: number, unit: string): string {
  return `${formatNumber(value)} ${unit === "INCH" ? "in" : "cm"}`;
}

/** Signed delta with sign prefix, e.g. "+1.2" / "-0.5". */
export function formatDelta(value: number, maxFractionDigits = 1): string {
  const s = formatNumber(Math.abs(value), maxFractionDigits);
  if (value > 0) return `+${s}`;
  if (value < 0) return `-${s}`;
  return s;
}
