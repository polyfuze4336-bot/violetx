"use client";

import { HBarChart } from "@/components/charts/h-bar-chart";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, MapPin, Search, Trophy } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/format";
import { MalaysiaMap } from "@/components/gym/malaysia-map";
import { CircularProgress } from "@/components/gym/circular-progress";
import {
  markGymVisitedAction,
  removeGymVisitAction,
} from "@/lib/actions/gym";
import type { GymBranchDTO, JourneyDTO } from "@/lib/services/gym";

type Filter = "ALL" | "VISITED" | "UNVISITED";

export function GymJourney({
  branches,
  journey,
  isOwner,
}: {
  branches: GymBranchDTO[];
  journey: JourneyDTO;
  isOwner: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [filter, setFilter] = useState<Filter>("ALL");
  const [stateFilter, setStateFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const states = useMemo(
    () => Array.from(new Set(branches.map((b) => b.state))).sort(),
    [branches]
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return branches.filter((b) => {
      if (filter === "VISITED" && !b.visited) return false;
      if (filter === "UNVISITED" && b.visited) return false;
      if (stateFilter !== "ALL" && b.state !== stateFilter) return false;
      if (q && !`${b.name} ${b.city ?? ""} ${b.state}`.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [branches, filter, stateFilter, search]);

  const selected = branches.find((b) => b.id === selectedId) ?? null;
  const { stats } = journey;

  function onMark(branchId: string) {
    startTransition(async () => {
      const result = await markGymVisitedAction(branchId);
      if (result.ok) {
        toast({ title: "Marked as visited" });
        router.refresh();
      } else {
        toast({ title: "Could not update", description: result.error, variant: "destructive" });
      }
    });
  }
  function onRemove(branchId: string) {
    startTransition(async () => {
      const result = await removeGymVisitAction(branchId);
      if (result.ok) {
        toast({ title: "Visit removed" });
        router.refresh();
      } else {
        toast({ title: "Could not update", description: result.error, variant: "destructive" });
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Top stats */}
      <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
        <Card className="flex flex-col items-center justify-center p-6">
          <CircularProgress
            percent={stats.percent}
            label={`${stats.percent}%`}
            sublabel="explored"
          />
          <p className="mt-3 text-center text-sm text-muted-foreground">
            {stats.uniqueVisited} / {stats.totalActive} gyms ·{" "}
            {stats.percent}% of Anytime Fitness Malaysia explored
          </p>
        </Card>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat label="Visited" value={stats.uniqueVisited} />
          <Stat label="Remaining" value={stats.remaining} />
          <Stat label="States visited" value={`${stats.statesVisited}/${stats.totalStates}`} />
          <Stat label="Latest gym" value={journey.latestBranchName ?? "—"} small />
          <Stat label="First gym" value={journey.firstBranchName ?? "—"} small />
          <Stat label="Most visited" value={journey.mostVisitedBranchName ?? "—"} small />
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          {(["ALL", "VISITED", "UNVISITED"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                filter === f
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              {f === "ALL" ? "All" : f === "VISITED" ? "Visited" : "Unvisited"}
            </button>
          ))}
        </div>
        <Select value={stateFilter} onValueChange={setStateFilter}>
          <SelectTrigger className="h-9 w-[190px]">
            <SelectValue placeholder="All states" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All states</SelectItem>
            {states.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative min-w-[180px] flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search branch or city"
            className="h-9 pl-8"
          />
        </div>
      </div>

      {/* Map + selection */}
      <MalaysiaMap
        branches={visible}
        selectedId={selectedId}
        onSelect={setSelectedId}
        focusState={stateFilter === "ALL" ? null : stateFilter}
      />

      {selected && (
        <Card className="border-primary/30">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" />
                <h3 className="font-semibold">{selected.name}</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                {[selected.city, selected.state].filter(Boolean).join(", ")}
              </p>
              {selected.visited ? (
                <p className="mt-1 flex items-center gap-1 text-sm font-medium text-primary">
                  <Check className="h-4 w-4" /> Explored
                  {selected.visitedAt && ` · ${formatDate(selected.visitedAt)}`}
                </p>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">
                  Not yet explored
                </p>
              )}
            </div>
            {isOwner && (
              <div className="flex gap-2">
                {selected.visited ? (
                  <Button
                    variant="outline"
                    onClick={() => onRemove(selected.id)}
                    disabled={isPending}
                  >
                    Remove visit
                  </Button>
                ) : (
                  <Button
                    onClick={() => onMark(selected.id)}
                    disabled={isPending}
                  >
                    <MapPin className="h-4 w-4" />
                    Mark as Visited
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* State progress */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">State progress</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {stats.byState.map((s) => (
            <button
              key={s.state}
              onClick={() => setStateFilter(s.state)}
              className="text-left"
            >
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-medium">{s.state}</span>
                <span className="tabular-nums text-muted-foreground">
                  {s.visited} / {s.total}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-brand-gradient"
                  style={{ width: `${s.total ? (s.visited / s.total) * 100 : 0}%` }}
                />
              </div>
            </button>
          ))}
        </CardContent>
      </Card>

      {journey.workouts.byGym.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              Workouts by gym
              {journey.workouts.favouriteGymName && (
                <span className="text-sm font-medium text-muted-foreground">Favourite: {journey.workouts.favouriteGymName}</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <HBarChart data={journey.workouts.byGym.map((g) => ({ name: g.name, value: g.workouts }))} />
            <p className="mt-2 text-xs text-muted-foreground">
              {journey.workouts.newGymsLast30Days} new gym{journey.workouts.newGymsLast30Days === 1 ? "" : "s"} in the last 30 days
            </p>
          </CardContent>
        </Card>
      )}

      {/* Achievements */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Trophy className="h-4 w-4 text-magenta" />
            Achievements
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {journey.achievements.map((a) => (
            <div
              key={a.key}
              className={cn(
                "rounded-xl border p-4",
                a.unlocked
                  ? "border-primary/30 bg-primary/5"
                  : "opacity-60"
              )}
            >
              <div className="flex items-center gap-2">
                <Trophy
                  className={cn(
                    "h-4 w-4",
                    a.unlocked ? "text-primary" : "text-muted-foreground"
                  )}
                />
                <p className="font-semibold">{a.label}</p>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {a.description}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  small,
}: {
  label: string;
  value: string | number;
  small?: boolean;
}) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1 font-bold tabular-nums", small ? "text-sm" : "text-2xl")}>
        {value}
      </p>
    </Card>
  );
}
