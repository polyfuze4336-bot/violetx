"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Send, Sparkles, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { toDateInputValue } from "@/lib/format";
import { MedicalDisclaimer } from "@/components/ai/medical-disclaimer";
import {
  violetCommitAction,
  violetInterpretAction,
} from "@/lib/actions/violet";
import { checkImportDuplicatesAction } from "@/lib/actions/import";
import { PATIENT_LABEL } from "@/lib/constants";
import type { Resolution, Unit } from "@/lib/schemas";

interface ChatMessage {
  role: "user" | "violet";
  text: string;
}
interface EMeas {
  name: string;
  value: string;
  unit: Unit;
  assumedUnit: boolean;
  confidence: number;
  resolution: Resolution;
  duplicate: boolean;
}
interface ESet {
  exercise: string;
  reps: string;
  weightKg: string;
  confidence: number;
  needsResolution: boolean;
  resolution: Resolution;
  duplicate: boolean;
}

function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const tone =
    pct >= 90 ? "text-success" : pct >= 70 ? "text-primary" : "text-magenta";
  return (
    <span className={cn("text-xs font-medium tabular-nums", tone)}>
      {pct}%
    </span>
  );
}

export function VioletChat({ provider }: { provider: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "violet", text: `Hi ${PATIENT_LABEL}. What did you train today?` },
  ]);
  const [input, setInput] = useState("");
  const [rawText, setRawText] = useState("");
  const [date, setDate] = useState(toDateInputValue());
  const [weight, setWeight] = useState<{
    value: string;
    confidence: number;
    resolution: Resolution;
    duplicate: boolean;
  } | null>(null);
  const [measurements, setMeasurements] = useState<EMeas[]>([]);
  const [sets, setSets] = useState<ESet[]>([]);
  const [hasProposals, setHasProposals] = useState(false);
  const [isPending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);

  function pushMessage(m: ChatMessage) {
    setMessages((prev) => [...prev, m]);
  }

  function send() {
    const text = input.trim();
    if (!text) return;
    setInput("");
    setRawText(text);
    pushMessage({ role: "user", text });

    startTransition(async () => {
      const result = await violetInterpretAction(text);
      if (!result.ok) {
        pushMessage({ role: "violet", text: result.error });
        return;
      }
      const r = result.data;
      pushMessage({ role: "violet", text: r.reply });
      for (const q of r.questions) pushMessage({ role: "violet", text: q });

      const nextDate = r.date ?? toDateInputValue();
      setDate(nextDate);
      setWeight(
        r.weightKg != null
          ? {
              value: String(r.weightKg),
              confidence: r.weightConfidence ?? 0.98,
              resolution: "IMPORT",
              duplicate: false,
            }
          : null
      );
      const nextMeas: EMeas[] = r.measurements.map((m) => ({
        name: m.name,
        value: String(m.value),
        unit: m.unit,
        assumedUnit: m.assumedUnit,
        confidence: m.confidence,
        resolution: "IMPORT",
        duplicate: false,
      }));
      const nextSets: ESet[] = r.sets.map((s) => ({
        exercise: s.exercise,
        reps: String(s.reps),
        weightKg: String(s.weightKg),
        confidence: s.confidence,
        needsResolution: s.needsResolution,
        resolution: "IMPORT",
        duplicate: false,
      }));
      setMeasurements(nextMeas);
      setSets(nextSets);
      setHasProposals(
        r.weightKg != null || nextMeas.length > 0 || nextSets.length > 0
      );

      // Duplicate detection (never overwrite automatically).
      if (nextMeas.length > 0 || nextSets.length > 0 || r.weightKg != null) {
        const dup = await checkImportDuplicatesAction({
          date: new Date(nextDate),
          weightKg: r.weightKg ?? undefined,
          measurements: nextMeas.map((m) => ({
            name: m.name,
            value: Number(m.value),
            unit: m.unit,
          })),
          sets: nextSets.map((s) => ({
            exercise: s.exercise,
            reps: Number(s.reps),
            weightKg: Number(s.weightKg),
          })),
        });
        if (dup.ok) {
          if (dup.data.weight) {
            setWeight((w) => (w ? { ...w, duplicate: true, resolution: "SKIP" } : w));
          }
          setMeasurements((prev) =>
            prev.map((m, i) =>
              dup.data.measurements[i]
                ? { ...m, duplicate: true, resolution: "SKIP" }
                : m
            )
          );
          setSets((prev) =>
            prev.map((s, i) =>
              dup.data.sets[i] ? { ...s, duplicate: true, resolution: "SKIP" } : s
            )
          );
          const dupCount =
            (dup.data.weight ? 1 : 0) +
            dup.data.measurements.filter(Boolean).length +
            dup.data.sets.filter(Boolean).length;
          if (dupCount > 0) {
            pushMessage({
              role: "violet",
              text: `Heads up — ${dupCount} of these already exist on ${nextDate}. I've set them to skip; change to Replace if you want to overwrite.`,
            });
          }
        }
      }
    });
    requestAnimationFrame(() =>
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
    );
  }

  const savable =
    (weight && weight.resolution !== "SKIP" ? 1 : 0) +
    measurements.filter((m) => m.resolution !== "SKIP").length +
    sets.filter((s) => s.resolution !== "SKIP").length;

  function saveAll() {
    startTransition(async () => {
      const result = await violetCommitAction({
        rawText,
        date,
        weight: weight
          ? {
              value: Number(weight.value),
              resolution: weight.resolution,
              confidence: weight.confidence,
            }
          : null,
        measurements: measurements
          .filter((m) => m.name.trim() && m.value)
          .map((m) => ({
            name: m.name.trim(),
            value: Number(m.value),
            unit: m.unit,
            resolution: m.resolution,
            confidence: m.confidence,
          })),
        sets: sets
          .filter((s) => s.exercise.trim() && s.reps && s.weightKg)
          .map((s) => ({
            exercise: s.exercise.trim(),
            reps: Number(s.reps),
            weightKg: Number(s.weightKg),
            resolution: s.resolution,
            confidence: s.confidence,
          })),
      });
      if (result.ok) {
        pushMessage({
          role: "violet",
          text: `Saved ${result.data.measurementsCreated} measurement(s) and ${result.data.setsCreated} set(s). Recorded to your history · approved by ${PATIENT_LABEL}.`,
        });
        setHasProposals(false);
        setMeasurements([]);
        setSets([]);
        setWeight(null);
        router.refresh();
      } else {
        toast({ title: "Could not save", description: result.error, variant: "destructive" });
      }
    });
  }

  function cancel() {
    setHasProposals(false);
    setMeasurements([]);
    setSets([]);
    setWeight(null);
    pushMessage({ role: "violet", text: "Okay, I won't save those." });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <Card className="lg:col-span-3">
        <CardContent className="flex h-[560px] flex-col p-0">
          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-5">
            {messages.map((m, i) => (
              <div
                key={i}
                className={cn(
                  "flex",
                  m.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-4 py-2 text-sm",
                    m.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  )}
                >
                  {m.role === "violet" && (
                    <span className="mb-1 flex items-center gap-1 text-xs font-semibold text-primary">
                      <Sparkles className="h-3 w-3" /> Violet
                    </span>
                  )}
                  <p className="whitespace-pre-wrap">{m.text}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="border-t p-3">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
              className="flex items-end gap-2"
            >
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                rows={2}
                placeholder="Tell Violet what you trained, or paste a WhatsApp update…"
                className="resize-none"
              />
              <Button type="submit" size="icon" disabled={isPending || !input.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </form>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              Powered by {provider}. Violet prepares changes for your approval —
              it never edits your data on its own.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4 lg:col-span-2">
        <MedicalDisclaimer />
        {hasProposals ? (
          <Card>
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Review &amp; save</h3>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="h-8 w-[150px]"
                />
              </div>

              {weight && (
                <ProposalRow
                  label="Weight"
                  duplicate={weight.duplicate}
                  confidence={weight.confidence}
                  resolution={weight.resolution}
                  onResolution={(r) => setWeight({ ...weight, resolution: r })}
                  onRemove={() => setWeight(null)}
                >
                  <Input
                    type="number"
                    step="0.1"
                    value={weight.value}
                    onChange={(e) =>
                      setWeight({ ...weight, value: e.target.value })
                    }
                    className="h-8"
                  />
                  <span className="text-xs text-muted-foreground">kg</span>
                </ProposalRow>
              )}

              {measurements.map((m, i) => (
                <ProposalRow
                  key={`m${i}`}
                  label={m.name}
                  warn={m.assumedUnit ? "assumed unit" : undefined}
                  duplicate={m.duplicate}
                  confidence={m.confidence}
                  resolution={m.resolution}
                  onResolution={(r) =>
                    setMeasurements((p) =>
                      p.map((x, j) => (j === i ? { ...x, resolution: r } : x))
                    )
                  }
                  onRemove={() =>
                    setMeasurements((p) => p.filter((_, j) => j !== i))
                  }
                >
                  <Input
                    type="number"
                    step="0.1"
                    value={m.value}
                    onChange={(e) =>
                      setMeasurements((p) =>
                        p.map((x, j) =>
                          j === i ? { ...x, value: e.target.value } : x
                        )
                      )
                    }
                    className="h-8 w-20"
                  />
                  <Select
                    value={m.unit}
                    onValueChange={(v) =>
                      setMeasurements((p) =>
                        p.map((x, j) =>
                          j === i
                            ? { ...x, unit: v as Unit, assumedUnit: false }
                            : x
                        )
                      )
                    }
                  >
                    <SelectTrigger className="h-8 w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CM">cm</SelectItem>
                      <SelectItem value="INCH">inch</SelectItem>
                    </SelectContent>
                  </Select>
                </ProposalRow>
              ))}

              {sets.map((s, i) => (
                <ProposalRow
                  key={`s${i}`}
                  label={s.exercise}
                  warn={s.needsResolution ? "please confirm exercise" : undefined}
                  duplicate={s.duplicate}
                  confidence={s.confidence}
                  resolution={s.resolution}
                  onResolution={(r) =>
                    setSets((p) =>
                      p.map((x, j) => (j === i ? { ...x, resolution: r } : x))
                    )
                  }
                  onRemove={() => setSets((p) => p.filter((_, j) => j !== i))}
                >
                  <Input
                    value={s.exercise}
                    onChange={(e) =>
                      setSets((p) =>
                        p.map((x, j) =>
                          j === i ? { ...x, exercise: e.target.value } : x
                        )
                      )
                    }
                    className="h-8 w-28"
                  />
                  <Input
                    type="number"
                    value={s.reps}
                    onChange={(e) =>
                      setSets((p) =>
                        p.map((x, j) =>
                          j === i ? { ...x, reps: e.target.value } : x
                        )
                      )
                    }
                    className="h-8 w-14"
                  />
                  <Input
                    type="number"
                    step="0.5"
                    value={s.weightKg}
                    onChange={(e) =>
                      setSets((p) =>
                        p.map((x, j) =>
                          j === i ? { ...x, weightKg: e.target.value } : x
                        )
                      )
                    }
                    className="h-8 w-16"
                  />
                </ProposalRow>
              ))}

              <div className="flex gap-2 pt-2">
                <Button
                  onClick={saveAll}
                  disabled={isPending || savable === 0}
                >
                  Save {savable} {savable === 1 ? "record" : "records"}
                </Button>
                <Button variant="ghost" onClick={cancel} disabled={isPending}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-5 text-sm text-muted-foreground">
              When you tell Violet about a workout or paste a WhatsApp update,
              the recognised records will appear here for you to review and save.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function ProposalRow({
  label,
  warn,
  duplicate,
  confidence,
  resolution,
  onResolution,
  onRemove,
  children,
}: {
  label: string;
  warn?: string;
  duplicate: boolean;
  confidence: number;
  resolution: Resolution;
  onResolution: (r: Resolution) => void;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border p-2.5">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        <div className="flex items-center gap-2">
          <ConfidenceBadge value={confidence} />
          {!duplicate && (
            <button
              type="button"
              onClick={onRemove}
              aria-label="Remove"
              className="text-muted-foreground hover:text-foreground"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">{children}</div>
      {warn && (
        <p className="mt-1 flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-3 w-3" /> {warn}
        </p>
      )}
      {duplicate && (
        <div className="mt-1.5">
          <Select
            value={resolution}
            onValueChange={(v) => onResolution(v as Resolution)}
          >
            <SelectTrigger className="h-7 w-[150px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="SKIP">Skip (duplicate)</SelectItem>
              <SelectItem value="IMPORT">Import anyway</SelectItem>
              <SelectItem value="REPLACE">Replace existing</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
