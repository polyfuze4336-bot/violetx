"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, Plus, SkipForward, Timer } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "violetx.rest-timer";
const PREF_KEY = "violetx.rest-pref";

export const REST_PRESETS = [30, 60, 90, 120, 180] as const;

interface Stored {
  endsAt: number | null;
  total: number;
  pausedRemaining: number | null;
}

export interface RestPref {
  auto: boolean;
  seconds: number;
}

function readJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function beep() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.value = 0.08;
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  } catch {
    // Sound is a nicety; the timer works without it.
  }
}

function notifyDone() {
  beep();
  if ("vibrate" in navigator) navigator.vibrate?.([200, 100, 200]);
  if ("Notification" in window && Notification.permission === "granted") {
    try {
      new Notification("Rest complete", { body: "Time for your next set." });
    } catch {
      // Some mobile browsers only allow notifications via a service worker.
    }
  }
}

/** Rest timer that survives refreshes (state lives in localStorage). */
export function useRestTimer() {
  const [state, setState] = useState<Stored>({ endsAt: null, total: 0, pausedRemaining: null });
  const [now, setNow] = useState(() => Date.now());
  const [pref, setPrefState] = useState<RestPref>({ auto: true, seconds: 90 });
  const firedRef = useRef(false);

  useEffect(() => {
    const saved = readJson<Stored>(STORAGE_KEY);
    if (saved) setState(saved);
    const p = readJson<RestPref>(PREF_KEY);
    if (p) setPrefState(p);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const running = state.endsAt !== null;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [running]);

  const remaining = state.pausedRemaining !== null
    ? state.pausedRemaining
    : state.endsAt !== null
      ? Math.max(0, Math.ceil((state.endsAt - now) / 1000))
      : 0;

  useEffect(() => {
    if (state.endsAt !== null && state.pausedRemaining === null && remaining === 0 && !firedRef.current) {
      firedRef.current = true;
      notifyDone();
      setState({ endsAt: null, total: 0, pausedRemaining: null });
    }
  }, [remaining, state.endsAt, state.pausedRemaining]);

  const start = useCallback((seconds: number) => {
    firedRef.current = false;
    const clamped = Math.max(5, Math.min(60 * 30, Math.round(seconds)));
    setNow(Date.now());
    setState({ endsAt: Date.now() + clamped * 1000, total: clamped, pausedRemaining: null });
    if ("Notification" in window && Notification.permission === "default") {
      void Notification.requestPermission().catch(() => undefined);
    }
  }, []);

  const add = useCallback((seconds: number) => {
    setState((s) =>
      s.pausedRemaining !== null
        ? { ...s, pausedRemaining: s.pausedRemaining + seconds, total: s.total + seconds }
        : s.endsAt !== null
          ? { ...s, endsAt: s.endsAt + seconds * 1000, total: s.total + seconds }
          : s
    );
  }, []);

  const toggle = useCallback(() => {
    setState((s) => {
      if (s.pausedRemaining !== null) {
        return { ...s, endsAt: Date.now() + s.pausedRemaining * 1000, pausedRemaining: null };
      }
      if (s.endsAt !== null) {
        return { ...s, endsAt: s.endsAt, pausedRemaining: Math.max(0, Math.ceil((s.endsAt - Date.now()) / 1000)) };
      }
      return s;
    });
  }, []);

  const skip = useCallback(() => {
    firedRef.current = true;
    setState({ endsAt: null, total: 0, pausedRemaining: null });
  }, []);

  const setPref = useCallback((p: RestPref) => {
    setPrefState(p);
    window.localStorage.setItem(PREF_KEY, JSON.stringify(p));
  }, []);

  return {
    active: state.endsAt !== null,
    paused: state.pausedRemaining !== null,
    remaining,
    total: state.total,
    pref,
    setPref,
    start,
    add,
    toggle,
    skip,
  };
}

export type RestTimerApi = ReturnType<typeof useRestTimer>;

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** Sticky rest timer bar. Idle state shows quick presets and the auto-rest toggle. */
export function RestTimerBar({ timer }: { timer: RestTimerApi }) {
  const [custom, setCustom] = useState("");
  const pct = timer.total > 0 ? Math.min(100, ((timer.total - timer.remaining) / timer.total) * 100) : 0;

  return (
    <div className="fixed inset-x-0 bottom-16 z-30 px-3 lg:bottom-4 lg:left-64">
      <div className="mx-auto max-w-2xl overflow-hidden rounded-2xl border bg-card/95 shadow-lg backdrop-blur">
        {timer.active ? (
          <div>
            <div className="h-1 bg-muted">
              <div className="h-full bg-primary transition-[width] duration-300" style={{ width: `${pct}%` }} />
            </div>
            <div className="flex items-center justify-between gap-2 p-3">
              <div className="flex items-center gap-3">
                <Timer className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-3xl font-bold tabular-nums leading-none" aria-live="off">
                    {fmt(timer.remaining)}
                  </p>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {timer.paused ? "Paused" : "Rest"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Button size="sm" variant="outline" onClick={() => timer.add(30)} aria-label="Add 30 seconds">
                  <Plus className="h-4 w-4" /> 30s
                </Button>
                <Button size="icon" variant="outline" onClick={timer.toggle} aria-label={timer.paused ? "Resume timer" : "Pause timer"}>
                  {timer.paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                </Button>
                <Button size="sm" onClick={timer.skip}>
                  <SkipForward className="h-4 w-4" /> Skip
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2 p-2.5">
            <Timer className="ml-1 h-4 w-4 text-muted-foreground" />
            {REST_PRESETS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  timer.setPref({ ...timer.pref, seconds: s });
                  timer.start(s);
                }}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-muted",
                  timer.pref.seconds === s && "border-primary text-primary"
                )}
              >
                {s < 60 ? `${s}s` : `${s / 60}m`}
              </button>
            ))}
            <form
              className="flex items-center gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                const n = Number(custom);
                if (n > 0) {
                  timer.start(n);
                  setCustom("");
                }
              }}
            >
              <input
                value={custom}
                onChange={(e) => setCustom(e.target.value.replace(/\D/g, "").slice(0, 4))}
                inputMode="numeric"
                placeholder="sec"
                aria-label="Custom rest seconds"
                className="h-8 w-14 rounded-md border bg-background px-2 text-center text-xs"
              />
              <Button type="submit" size="sm" variant="outline" className="h-8 px-2 text-xs">
                Start
              </Button>
            </form>
            <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                className="accent-primary"
                checked={timer.pref.auto}
                onChange={(e) => timer.setPref({ ...timer.pref, auto: e.target.checked })}
              />
              Auto-start
            </label>
          </div>
        )}
      </div>
    </div>
  );
}
