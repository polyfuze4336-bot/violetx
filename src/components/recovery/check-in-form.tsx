"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Minus, Moon, Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { saveCheckInAction } from "@/lib/actions/goals";
import type { CheckInDTO } from "@/lib/services/checkin";

function localDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const SCALES: { key: "sleepQuality" | "energy" | "soreness" | "stress" | "motivation"; label: string; low: string; high: string }[] = [
  { key: "sleepQuality", label: "Sleep quality", low: "Poor", high: "Great" },
  { key: "energy", label: "Energy", low: "Low", high: "High" },
  { key: "soreness", label: "Muscle soreness", low: "Fresh", high: "Very sore" },
  { key: "stress", label: "Stress", low: "Calm", high: "Stressed" },
  { key: "motivation", label: "Motivation", low: "Low", high: "High" },
];

export function CheckInForm({ existing }: { existing: CheckInDTO | null }) {
  const router = useRouter();
  const { toast } = useToast();
  const [hours, setHours] = useState(existing?.sleepHours ?? 7.5);
  const [values, setValues] = useState({
    sleepQuality: existing?.sleepQuality ?? 3,
    energy: existing?.energy ?? 3,
    soreness: existing?.soreness ?? 2,
    stress: existing?.stress ?? 2,
    motivation: existing?.motivation ?? 3,
  });
  const [hr, setHr] = useState(existing?.restingHr ? String(existing.restingHr) : "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const res = await saveCheckInAction({
      date: localDate(),
      sleepHours: hours,
      ...values,
      restingHr: hr ? Number(hr) : undefined,
      notes: notes || undefined,
    });
    setBusy(false);
    if (res.ok) {
      toast({ title: "Check-in saved" });
      router.refresh();
    } else toast({ title: "Could not save", description: res.error, variant: "destructive" });
  }

  return (
    <Card className="space-y-5 p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-semibold">
          <Moon className="h-4 w-4 text-primary" /> Sleep
        </div>
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Less sleep" onClick={() => setHours((h) => Math.max(0, Math.round((h - 0.5) * 10) / 10))} className="flex h-11 w-11 items-center justify-center rounded-xl border active:scale-95">
            <Minus className="h-4 w-4" />
          </button>
          <span className="w-20 text-center text-2xl font-bold tabular-nums">{hours.toFixed(1)}h</span>
          <button type="button" aria-label="More sleep" onClick={() => setHours((h) => Math.min(16, Math.round((h + 0.5) * 10) / 10))} className="flex h-11 w-11 items-center justify-center rounded-xl border active:scale-95">
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {SCALES.map((s) => (
        <div key={s.key} className="space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">{s.label}</span>
            <span className="text-xs text-muted-foreground">
              {s.low} → {s.high}
            </span>
          </div>
          <div className="grid grid-cols-5 gap-1.5" role="group" aria-label={s.label}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setValues((v) => ({ ...v, [s.key]: n }))}
                className={cn(
                  "h-11 rounded-xl border text-sm font-semibold transition-colors",
                  values[s.key] === n ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
                )}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      ))}

      <div className="grid gap-3 sm:grid-cols-2">
        <Input value={hr} onChange={(e) => setHr(e.target.value.replace(/\D/g, "").slice(0, 3))} inputMode="numeric" placeholder="Resting heart rate (optional)" aria-label="Resting heart rate" />
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={1} maxLength={1024} placeholder="Notes (optional)" aria-label="Notes" />
      </div>
      <Button onClick={save} disabled={busy} className="h-12 w-full text-base font-semibold">
        {existing ? "Update today's check-in" : "Save check-in"}
      </Button>
    </Card>
  );
}
