"use client";

// Default map provider: a dependency-free SVG projection of Malaysia. When
// AZURE_MAPS_KEY is configured, an Azure Maps renderer can replace this behind
// the same props (branches + selection). Reads all locations from the database.

import { useMemo } from "react";

import { cn } from "@/lib/utils";
import type { GymBranchDTO } from "@/lib/services/gym";

const BOUNDS = { minLng: 99.3, maxLng: 119.7, minLat: 0.5, maxLat: 7.6 };
const VIEW_W = 1000;
const VIEW_H = Math.round(
  (VIEW_W * (BOUNDS.maxLat - BOUNDS.minLat)) / (BOUNDS.maxLng - BOUNDS.minLng)
);

function project(lat: number, lng: number) {
  const x = ((lng - BOUNDS.minLng) / (BOUNDS.maxLng - BOUNDS.minLng)) * VIEW_W;
  const y = ((BOUNDS.maxLat - lat) / (BOUNDS.maxLat - BOUNDS.minLat)) * VIEW_H;
  return { x, y };
}

export function MalaysiaMap({
  branches,
  selectedId,
  onSelect,
  focusState,
}: {
  branches: GymBranchDTO[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  focusState?: string | null;
}) {
  const points = useMemo(
    () =>
      branches.map((b) => ({ branch: b, ...project(b.latitude, b.longitude) })),
    [branches]
  );

  // Focus viewBox on a selected state's bounding box (zoom-to-state).
  const viewBox = useMemo(() => {
    if (!focusState) return `0 0 ${VIEW_W} ${VIEW_H}`;
    const inState = points.filter((p) => p.branch.state === focusState);
    if (inState.length === 0) return `0 0 ${VIEW_W} ${VIEW_H}`;
    const xs = inState.map((p) => p.x);
    const ys = inState.map((p) => p.y);
    const pad = 80;
    const minX = Math.max(0, Math.min(...xs) - pad);
    const minY = Math.max(0, Math.min(...ys) - pad);
    const w = Math.min(VIEW_W, Math.max(...xs) - minX + pad);
    const h = Math.min(VIEW_H, Math.max(...ys) - minY + pad);
    return `${minX} ${minY} ${w} ${h}`;
  }, [focusState, points]);

  return (
    <div className="overflow-hidden rounded-2xl border bg-gradient-to-br from-muted/40 to-background">
      <svg
        viewBox={viewBox}
        className="h-full w-full"
        style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}` }}
        role="img"
        aria-label="Map of visited Anytime Fitness Malaysia branches"
      >
        {/* subtle grid */}
        <defs>
          <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
            <path
              d="M 50 0 L 0 0 0 50"
              fill="none"
              stroke="hsl(var(--border))"
              strokeWidth="0.5"
              strokeOpacity="0.5"
            />
          </pattern>
        </defs>
        <rect width={VIEW_W} height={VIEW_H} fill="url(#grid)" />

        {/* Primary-colour exploration radius around visited branches (overlaps blend) */}
        {points
          .filter((p) => p.branch.visited)
          .map((p) => (
            <circle
              key={`r-${p.branch.id}`}
              cx={p.x}
              cy={p.y}
              r={34}
              fill="hsl(var(--primary))"
              fillOpacity={0.16}
            />
          ))}

        {/* Markers */}
        {points.map((p) => {
          const selected = p.branch.id === selectedId;
          return (
            <g
              key={p.branch.id}
              transform={`translate(${p.x} ${p.y})`}
              onClick={() => onSelect(p.branch.id)}
              className="cursor-pointer"
            >
              {selected && (
                <circle
                  r={13}
                  fill="none"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                />
              )}
              <circle
                r={selected ? 8 : 6}
                fill={
                  p.branch.visited
                    ? "hsl(var(--primary))"
                    : "hsl(var(--muted-foreground))"
                }
                fillOpacity={p.branch.visited ? 1 : 0.55}
                stroke="white"
                strokeWidth={1.5}
                className={cn(
                  "transition-all",
                  p.branch.visited && "drop-shadow"
                )}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
