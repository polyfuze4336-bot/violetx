"use client";

import { useMemo, useState } from "react";
import { Dumbbell, NotebookPen, Ruler, Trophy } from "lucide-react";

import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import {
  formatDayMonth,
  formatMeasurement,
  formatMonth,
  formatNumber,
} from "@/lib/format";
import type {
  BodyWeightDTO,
  ExerciseEntryDTO,
  MeasurementEntryDTO,
  NoteDTO,
} from "@/lib/dto";
import type { PrEventDTO } from "@/lib/services/personalRecord";
import { prEventDetail } from "@/lib/analytics";

type Filter = "ALL" | "BODY" | "STRENGTH" | "PR";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "ALL", label: "Everything" },
  { key: "BODY", label: "Body" },
  { key: "STRENGTH", label: "Strength" },
  { key: "PR", label: "PRs" },
];

interface DayLog {
  day: string; // yyyy-mm-dd
  iso: string;
  weights: BodyWeightDTO[];
  measurements: MeasurementEntryDTO[];
  sets: ExerciseEntryDTO[];
  notes: NoteDTO[];
  prs: PrEventDTO[];
}

export function HistoryTimeline({
  weights,
  measurements,
  sets,
  notes,
  prEvents,
}: {
  weights: BodyWeightDTO[];
  measurements: MeasurementEntryDTO[];
  sets: ExerciseEntryDTO[];
  notes: NoteDTO[];
  prEvents: PrEventDTO[];
}) {
  const [filter, setFilter] = useState<Filter>("ALL");

  const days = useMemo(() => {
    const map = new Map<string, DayLog>();
    const ensure = (iso: string): DayLog => {
      const day = iso.slice(0, 10);
      let log = map.get(day);
      if (!log) {
        log = {
          day,
          iso,
          weights: [],
          measurements: [],
          sets: [],
          notes: [],
          prs: [],
        };
        map.set(day, log);
      }
      return log;
    };
    weights.forEach((w) => ensure(w.date).weights.push(w));
    measurements.forEach((m) => ensure(m.date).measurements.push(m));
    sets.forEach((s) => ensure(s.date).sets.push(s));
    notes.forEach((n) => ensure(n.date).notes.push(n));
    prEvents.forEach((p) => ensure(p.date).prs.push(p));
    return Array.from(map.values()).sort((a, b) =>
      b.day.localeCompare(a.day)
    );
  }, [weights, measurements, sets, notes, prEvents]);

  const showBody = filter === "ALL" || filter === "BODY";
  const showStrength = filter === "ALL" || filter === "STRENGTH";
  const showNotes = filter === "ALL";
  const showPr = filter === "ALL" || filter === "PR";

  const visibleDays = days.filter((d) => {
    if (filter === "BODY") return d.weights.length || d.measurements.length;
    if (filter === "STRENGTH") return d.sets.length;
    if (filter === "PR") return d.prs.length;
    return true;
  });

  // Group visible days by month for headers.
  const months: { month: string; label: string; days: DayLog[] }[] = [];
  for (const d of visibleDays) {
    const key = d.day.slice(0, 7);
    let group = months.find((g) => g.month === key);
    if (!group) {
      group = { month: key, label: formatMonth(d.iso), days: [] };
      months.push(group);
    }
    group.days.push(d);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              filter === f.key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {visibleDays.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing to show for this filter.
        </p>
      ) : (
        months.map((group) => (
          <section key={group.month} className="space-y-3">
            <h2 className="text-lg font-semibold tracking-tight">
              {group.label}
            </h2>
            {group.days.map((d) => (
              <Card key={d.day}>
                <CardContent className="space-y-4 p-5">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-brand-gradient" />
                    <h3 className="text-sm font-semibold">
                      {formatDayMonth(d.iso)}
                    </h3>
                  </div>

                  {showPr && d.prs.length > 0 && (
                    <Group icon={<Trophy className="h-4 w-4" />} label="Personal records" accent="text-magenta">
                      {d.prs.map((p, i) => (
                        <Row
                          key={i}
                          title={p.exerciseName}
                          detail={`${formatNumber(p.weightKg)}kg${p.assisted ? " assistance" : ""} × ${p.reps} — ${prEventDetail(p).label.toLowerCase()} ${prEventDetail(p).detail}`}
                        />
                      ))}
                    </Group>
                  )}

                  {showBody &&
                    (d.weights.length > 0 || d.measurements.length > 0) && (
                      <Group icon={<Ruler className="h-4 w-4" />} label="Body" accent="text-primary">
                        {d.weights.map((w) => (
                          <Row
                            key={w.id}
                            title="Weight"
                            detail={`${formatNumber(w.weightKg)} kg`}
                          />
                        ))}
                        {d.measurements.map((m) => (
                          <Row
                            key={m.id}
                            title={m.typeName}
                            detail={formatMeasurement(m.value, m.unit)}
                          />
                        ))}
                      </Group>
                    )}

                  {showStrength && d.sets.length > 0 && (
                    <Group icon={<Dumbbell className="h-4 w-4" />} label="Strength" accent="text-chart-2">
                      {d.sets.map((s) => (
                        <Row
                          key={s.id}
                          title={s.exerciseName}
                          detail={`${formatNumber(s.weightKg)}kg × ${s.reps}`}
                        />
                      ))}
                    </Group>
                  )}

                  {showNotes && d.notes.length > 0 && (
                    <Group icon={<NotebookPen className="h-4 w-4" />} label="Notes" accent="text-success">
                      {d.notes.map((n) => (
                        <Row key={n.id} title={n.title ?? "Note"} detail={n.body} />
                      ))}
                    </Group>
                  )}
                </CardContent>
              </Card>
            ))}
          </section>
        ))
      )}
    </div>
  );
}

function Group({
  icon,
  label,
  accent,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className={cn("mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide", accent)}>
        {icon}
        {label}
      </div>
      <div className="space-y-1 pl-1">{children}</div>
    </div>
  );
}

function Row({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{title}</span>
      <span className="text-right font-medium tabular-nums">{detail}</span>
    </div>
  );
}
