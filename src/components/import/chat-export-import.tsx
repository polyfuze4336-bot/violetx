"use client";

import { useMemo, useRef, useState } from "react";
import { AlertTriangle, FileUp, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  checkImportDuplicatesAction,
  commitImportAction,
} from "@/lib/actions/import";
import { formatDate } from "@/lib/format";
import type { MeasurementTypeDTO } from "@/lib/dto";
import type { Unit } from "@/lib/schemas";
import {
  groupExportMessages,
  readWhatsAppExport,
  type ExportDay,
  type ExportMessage,
} from "@/lib/whatsapp-export";
import { resolveMeasurementUnit } from "@/lib/whatsapp-parser";

const MAX_TEXT_BYTES = 10 * 1024 * 1024;
const MAX_ZIP_BYTES = 25 * 1024 * 1024;

async function readExportFile(file: File): Promise<string> {
  if (/\.zip$/i.test(file.name)) {
    if (file.size > MAX_ZIP_BYTES) throw new Error("That file is too large.");
    const { unzipSync, strFromU8 } = await import("fflate");
    const entries = unzipSync(new Uint8Array(await file.arrayBuffer()), {
      filter: (f) => /\.txt$/i.test(f.name) && f.originalSize <= MAX_TEXT_BYTES,
    });
    const names = Object.keys(entries);
    const name = names.find((n) => /_chat\.txt$/i.test(n)) ?? names[0];
    if (!name) throw new Error("No chat text file was found in that zip.");
    return strFromU8(entries[name]);
  }
  if (file.size > MAX_TEXT_BYTES) throw new Error("That file is too large.");
  return file.text();
}

interface BulkResult {
  imported: number;
  skipped: number;
  failed: string[];
}

export function ChatExportImport({
  types,
  defaultMeasurementUnit,
  onReview,
}: {
  types: MeasurementTypeDTO[];
  defaultMeasurementUnit: Unit;
  onReview: (day: ExportDay) => void;
}) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [messages, setMessages] = useState<ExportMessage[]>([]);
  const [senders, setSenders] = useState<string[]>([]);
  const [activeSenders, setActiveSenders] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [result, setResult] = useState<BulkResult | null>(null);

  const days = useMemo(
    () =>
      groupExportMessages(messages, {
        senders: Array.from(activeSenders),
        knownMeasurementNames: types.filter((t) => t.active).map((t) => t.name),
      }),
    [messages, activeSenders, types]
  );
  // null = "all days selected" until the user changes the selection.
  const selectedDates = selected ?? new Set(days.map((d) => d.date));
  const chosen = days.filter((d) => selectedDates.has(d.date));

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setResult(null);
    try {
      const parsed = readWhatsAppExport(await readExportFile(file));
      if (parsed.messages.length === 0) {
        throw new Error(
          "This doesn't look like a WhatsApp chat export (.txt or .zip)."
        );
      }
      setFileName(file.name);
      setMessages(parsed.messages);
      setSenders(parsed.senders);
      setActiveSenders(new Set(parsed.senders));
      setSelected(null);
    } catch (err) {
      setMessages([]);
      setSenders([]);
      setFileName(null);
      setError(err instanceof Error ? err.message : "Could not read that file.");
    }
  }

  function toggleSender(name: string) {
    setActiveSenders((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
    setSelected(null);
  }

  function toggleDay(date: string) {
    const next = new Set(selectedDates);
    if (next.has(date)) next.delete(date);
    else next.add(date);
    setSelected(next);
  }

  function unitFor(name: string, written: Unit | null): Unit {
    const t = types.find((x) => x.name.toLowerCase() === name.toLowerCase());
    return resolveMeasurementUnit(written, t?.defaultUnit, defaultMeasurementUnit);
  }

  // Duplicates are always skipped here — never overwritten automatically.
  // Use "Review" on a day to choose Import anyway / Replace per item.
  async function importSelected() {
    setBusy(true);
    setError(null);
    const out: BulkResult = { imported: 0, skipped: 0, failed: [] };
    for (let i = 0; i < chosen.length; i++) {
      const day = chosen[i];
      setProgress(`Importing ${i + 1} of ${chosen.length} — ${formatDate(day.date)}`);
      const date = new Date(day.date);
      const measurements = day.measurements.map((m) => ({
        name: m.name,
        value: m.value,
        unit: unitFor(m.name, m.unit),
      }));
      const sets = day.sets.map((s) => ({ ...s }));
      const weightKg = day.weightKg ?? undefined;

      const dup = await checkImportDuplicatesAction({
        date,
        weightKg,
        measurements,
        sets,
      });
      if (!dup.ok) {
        out.failed.push(`${formatDate(day.date)}: ${dup.error}`);
        continue;
      }
      const res = (isDup: boolean): "SKIP" | "IMPORT" =>
        isDup ? "SKIP" : "IMPORT";
      const commit = await commitImportAction({
        rawText: day.sourceText,
        date,
        weightKg,
        weightResolution: res(dup.data.weight),
        measurements: measurements.map((m, idx) => ({
          ...m,
          resolution: res(dup.data.measurements[idx] ?? false),
        })),
        sets: sets.map((s, idx) => ({
          ...s,
          resolution: res(dup.data.sets[idx] ?? false),
        })),
      });
      if (commit.ok) {
        out.imported +=
          (commit.data.weightRecorded ? 1 : 0) +
          commit.data.measurementsCreated +
          commit.data.setsCreated;
        out.skipped += commit.data.skipped;
      } else {
        out.failed.push(`${formatDate(day.date)}: ${commit.error}`);
      }
    }
    setBusy(false);
    setProgress(null);
    setResult(out);
    if (out.failed.length === 0) {
      toast({
        title: "Chat export imported",
        description: `${out.imported} record(s) created, ${out.skipped} duplicate(s) skipped.`,
      });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Import a WhatsApp chat export</CardTitle>
        <CardDescription>
          In WhatsApp, open the chat → Export chat → Without media, then upload
          the .txt (or .zip) here. Your file is read in your browser; only the
          workout and measurement records you confirm are saved.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <input
          ref={fileRef}
          type="file"
          accept=".txt,.zip,text/plain,application/zip"
          className="hidden"
          onChange={onFile}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
        >
          <FileUp className="h-4 w-4" />
          Import chat export file
        </Button>
        {fileName && (
          <span className="ml-3 text-sm text-muted-foreground">{fileName}</span>
        )}

        {error && (
          <p className="flex items-start gap-2 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </p>
        )}

        {messages.length > 0 && (
          <div className="space-y-4">
            {senders.length > 1 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Include messages from
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {senders.map((s) => (
                    <label key={s} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-primary"
                        checked={activeSenders.has(s)}
                        onChange={() => toggleSender(s)}
                        disabled={busy}
                      />
                      {s}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {days.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No workout or measurement records were found in the selected
                messages. Only your tracked measurements, body weight and sets
                like &quot;Hip abduction 9x50kg&quot; are recognised.
              </p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Found records on {days.length} day(s). Untick anything you
                  don&apos;t want, or review a day to edit it first.
                </p>
                <ul className="max-h-80 divide-y overflow-y-auto rounded-md border">
                  {days.map((d) => (
                    <li
                      key={d.date}
                      className="flex items-center justify-between gap-3 p-3 text-sm"
                    >
                      <label className="flex min-w-0 items-center gap-3">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-primary"
                          checked={selectedDates.has(d.date)}
                          onChange={() => toggleDay(d.date)}
                          disabled={busy}
                        />
                        <span className="min-w-0">
                          <span className="font-medium">{formatDate(d.date)}</span>
                          <span className="block text-xs text-muted-foreground">
                            {[
                              d.weightKg !== null ? "weight" : null,
                              d.measurements.length
                                ? `${d.measurements.length} measurement(s)`
                                : null,
                              d.sets.length ? `${d.sets.length} set(s)` : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </span>
                      </label>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => onReview(d)}
                      >
                        Review
                      </Button>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    onClick={importSelected}
                    disabled={busy || chosen.length === 0}
                  >
                    {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                    Import {chosen.length} selected day(s)
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    {progress ??
                      "Records that already exist are skipped, never overwritten."}
                  </p>
                </div>
              </>
            )}
          </div>
        )}

        {result && (
          <div className="rounded-md border border-success/30 bg-success/5 p-3 text-sm">
            <p className="font-medium">
              {result.imported} record(s) imported · {result.skipped} duplicate(s)
              skipped
            </p>
            {result.failed.length > 0 && (
              <ul className="mt-2 list-disc pl-5 text-destructive">
                {result.failed.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
