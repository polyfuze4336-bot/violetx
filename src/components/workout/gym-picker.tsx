"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, Search, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { recentGymBranchesAction, searchGymBranchesAction } from "@/lib/actions/gym";
import type { GymOptionDTO } from "@/lib/services/gym";

/** Optional gym chooser: recent gyms as chips plus a search box. */
export function GymPicker({
  value,
  onChange,
}: {
  value: GymOptionDTO | null;
  onChange: (gym: GymOptionDTO | null) => void;
}) {
  const [recent, setRecent] = useState<GymOptionDTO[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GymOptionDTO[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    void recentGymBranchesAction().then((r) => r.ok && setRecent(r.data));
  }, []);

  useEffect(() => {
    clearTimeout(timer.current);
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    timer.current = setTimeout(() => {
      void searchGymBranchesAction(query).then((r) => r.ok && setResults(r.data.slice(0, 6)));
    }, 250);
    return () => clearTimeout(timer.current);
  }, [query]);

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-xl border bg-muted/40 px-3 py-2 text-sm">
        <span className="flex min-w-0 items-center gap-2">
          <MapPin className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate font-medium">{value.name}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{value.state}</span>
        </span>
        <button type="button" aria-label="Clear gym" onClick={() => onChange(null)} className="rounded-full p-1 hover:bg-muted">
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {recent.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {recent.map((g) => (
            <button key={g.id} type="button" onClick={() => onChange(g)} className="flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium hover:bg-muted">
              <MapPin className="h-3 w-3 text-primary" /> {g.name}
            </button>
          ))}
        </div>
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Gym (optional) — search by name or city" aria-label="Search gyms" className="pl-9" />
      </div>
      {results.length > 0 && (
        <ul className="divide-y rounded-xl border">
          {results.map((g) => (
            <li key={g.id}>
              <button
                type="button"
                onClick={() => {
                  onChange(g);
                  setQuery("");
                  setResults([]);
                }}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
              >
                <span className="truncate">{g.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{g.city ? `${g.city}, ` : ""}{g.state}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
