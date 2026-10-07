// Pure parser for WhatsApp "Export chat" files (.txt). Splits the export into
// messages, then reuses the single-message parser to turn each one into
// structured records grouped by day. No IO — fully unit-testable.

import {
  parseWhatsAppMessage,
  type ParsedExerciseSet,
  type ParsedMeasurement,
} from "@/lib/whatsapp-parser";

export interface ExportMessage {
  /** ISO date (yyyy-mm-dd) the message was sent. */
  date: string;
  sender: string;
  text: string;
}

export interface ReadExportResult {
  messages: ExportMessage[];
  senders: string[];
}

export interface ExportDay {
  date: string;
  weightKg: number | null;
  measurements: ParsedMeasurement[];
  sets: ParsedExerciseSet[];
  messageCount: number;
  /** Original message text for the day, kept as the import's audit trail. */
  sourceText: string;
}

export interface GroupOptions {
  /** Only keep messages from these senders; null/undefined keeps everyone. */
  senders?: string[] | null;
  /**
   * Measurement names to accept (case-insensitive). Chat is noisy, so anything
   * else ("ok 5") is ignored rather than creating junk measurement types.
   */
  knownMeasurementNames: string[];
}

const MAX_SOURCE_CHARS = 20000;

// Strip invisible direction marks / narrow no-break spaces WhatsApp inserts.
function clean(line: string): string {
  return line
    .replace(/[\u200e\u200f\u202a-\u202e]/g, "")
    .replace(/[\u202f\u00a0]/g, " ")
    .replace(/^\uFEFF/, "");
}

const DATE = String.raw`(\d{1,4}[/.\-]\d{1,2}[/.\-]\d{1,4})`;
const TIME = String.raw`\d{1,2}:\d{2}(?::\d{2})?(?:\s?[APap]\.?[Mm]\.?)?`;
// iOS: [16/08/2026, 10:34:12 PM] Name: text
const IOS = new RegExp(String.raw`^\[${DATE},?\s+${TIME}\]\s+(.*)$`);
// Android: 16/08/2026, 22:34 - Name: text
const ANDROID = new RegExp(String.raw`^${DATE},?\s+${TIME}\s+-\s+(.*)$`);

interface RawMessage {
  parts: [number, number, number];
  firstIsYear: boolean;
  body: string;
}

function splitDate(raw: string): { parts: [number, number, number]; firstIsYear: boolean } {
  const [a, b, c] = raw.split(/[/.\-]/);
  const firstIsYear = a.length === 4;
  return { parts: [Number(a), Number(b), Number(c)], firstIsYear };
}

function toIso(y: number, m: number, d: number): string | null {
  const year = y < 100 ? 2000 + y : y;
  const date = new Date(year, m - 1, d);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== m - 1 ||
    date.getDate() !== d
  ) {
    return null;
  }
  return `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Day-first unless the data proves month-first (any 2nd component > 12). */
function detectMonthFirst(raws: RawMessage[]): boolean {
  let dayFirstProof = false;
  let monthFirstProof = false;
  for (const r of raws) {
    if (r.firstIsYear) continue;
    if (r.parts[0] > 12) dayFirstProof = true;
    if (r.parts[1] > 12) monthFirstProof = true;
  }
  return monthFirstProof && !dayFirstProof;
}

/** Split an export into dated, attributed messages. System lines are dropped. */
export function readWhatsAppExport(text: string): ReadExportResult {
  const raws: RawMessage[] = [];

  for (const original of text.split(/\r?\n/)) {
    const line = clean(original);
    const m = line.match(IOS) ?? line.match(ANDROID);
    if (m) {
      const { parts, firstIsYear } = splitDate(m[1]);
      raws.push({ parts, firstIsYear, body: m[2] });
    } else if (raws.length > 0) {
      // Continuation of a multi-line message.
      raws[raws.length - 1].body += `\n${line}`;
    }
  }

  const monthFirst = detectMonthFirst(raws);
  const messages: ExportMessage[] = [];
  const senders = new Set<string>();

  for (const r of raws) {
    const sm = r.body.match(/^([^:\n]{1,80}?):\s([\s\S]*)$/);
    if (!sm) continue; // system message ("Messages are end-to-end encrypted")
    const body = sm[2].trim();
    if (!body || /^<media omitted>$/i.test(body)) continue;

    const [p0, p1, p2] = r.parts;
    const iso = r.firstIsYear
      ? toIso(p0, p1, p2)
      : monthFirst
        ? toIso(p2, p0, p1)
        : toIso(p2, p1, p0);
    if (!iso) continue;

    const sender = sm[1].trim();
    senders.add(sender);
    messages.push({ date: iso, sender, text: body });
  }

  return { messages, senders: Array.from(senders).sort() };
}

const MIN_WEIGHT_KG = 20;
const MAX_WEIGHT_KG = 400;
const MAX_REPS = 100;
const MAX_SET_KG = 500;

/** Turn messages into per-day structured records, ascending by date. */
export function groupExportMessages(
  messages: ExportMessage[],
  options: GroupOptions
): ExportDay[] {
  const allowedSenders = options.senders ? new Set(options.senders) : null;
  const known = new Set(options.knownMeasurementNames.map((n) => n.toLowerCase()));
  const days = new Map<string, ExportDay>();

  for (const msg of messages) {
    if (allowedSenders && !allowedSenders.has(msg.sender)) continue;

    const parsed = parseWhatsAppMessage(
      msg.text,
      new Date(`${msg.date}T12:00:00`)
    );
    const weightKg =
      parsed.weightKg !== null &&
      parsed.weightKg >= MIN_WEIGHT_KG &&
      parsed.weightKg <= MAX_WEIGHT_KG
        ? parsed.weightKg
        : null;
    const measurements = parsed.measurements.filter((m) =>
      known.has(m.name.toLowerCase())
    );
    const sets = parsed.sets.filter(
      (s) => s.reps >= 1 && s.reps <= MAX_REPS && s.weightKg <= MAX_SET_KG
    );
    if (weightKg === null && measurements.length === 0 && sets.length === 0) {
      continue;
    }

    // A date written inside the message wins over the send date.
    const date = parsed.date ?? msg.date;
    const day =
      days.get(date) ??
      ({
        date,
        weightKg: null,
        measurements: [],
        sets: [],
        messageCount: 0,
        sourceText: "",
      } satisfies ExportDay);

    if (weightKg !== null) day.weightKg = weightKg;
    for (const m of measurements) {
      const idx = day.measurements.findIndex(
        (x) => x.name.toLowerCase() === m.name.toLowerCase()
      );
      if (idx >= 0) day.measurements[idx] = m; // latest reading of the day wins
      else day.measurements.push(m);
    }
    day.sets.push(...sets);
    day.messageCount += 1;
    day.sourceText = `${day.sourceText}${day.sourceText ? "\n\n" : ""}${msg.text}`.slice(
      0,
      MAX_SOURCE_CHARS
    );
    days.set(date, day);
  }

  return Array.from(days.values()).sort((a, b) => a.date.localeCompare(b.date));
}
