"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Trophy, X } from "lucide-react";

import { prDetail, type PrAchievement } from "@/lib/workout-engine";

export interface PrCelebrationData {
  exerciseName: string;
  weightKg: number;
  reps: number;
  achievements: PrAchievement[];
  estimatedOneRepMaxKg: number;
}

/** Tasteful PR overlay: a calm card with an orange glow, auto-dismissed. */
export function PrCelebration({
  data,
  onClose,
}: {
  data: PrCelebrationData | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!data) return;
    const t = setTimeout(onClose, 5000);
    return () => clearTimeout(t);
  }, [data, onClose]);

  // Only an estimated-1RM achievement carries the "vs previous best" percentage.
  const best = data ? data.achievements.find((a) => a.type === "E1RM") ?? null : null;

  return (
    <AnimatePresence>
      {data && (
        <motion.div
          key="pr"
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 top-16 z-50 flex justify-center px-4"
          initial={{ opacity: 0, y: -24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -16 }}
          transition={{ type: "spring", stiffness: 260, damping: 24 }}
        >
          <div className="pointer-events-auto relative w-full max-w-sm overflow-hidden rounded-2xl border border-primary/40 bg-card p-5 shadow-[0_0_48px_-8px_hsl(var(--primary)/0.55)]">
            <motion.div
              aria-hidden
              className="absolute inset-0 bg-brand-gradient opacity-10"
              animate={{ opacity: [0.06, 0.16, 0.06] }}
              transition={{ duration: 2.4, repeat: Infinity }}
            />
            <button
              type="button"
              onClick={onClose}
              aria-label="Dismiss"
              className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="relative flex items-center gap-3">
              <motion.div
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-gradient text-white"
                initial={{ rotate: -12, scale: 0.7 }}
                animate={{ rotate: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 15 }}
              >
                <Trophy className="h-5 w-5" />
              </motion.div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">New PR</p>
                <p className="text-lg font-bold leading-tight">{data.exerciseName}</p>
              </div>
            </div>
            <p className="relative mt-3 text-3xl font-bold tabular-nums">
              {data.weightKg} kg × {data.reps}
            </p>
            <p className="relative text-sm text-muted-foreground">
              Estimated 1RM: {data.estimatedOneRepMaxKg} kg
              {best && best.deltaPct > 0 && (
                <span className="ml-2 font-semibold text-success">+{best.deltaPct}% vs previous best</span>
              )}
            </p>
            <ul className="relative mt-3 space-y-1.5">
              {data.achievements.map((a) => (
                <li key={a.type} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
                    {a.type === "REPS" ? "Rep PR" : a.label}
                  </span>
                  <span className="text-xs text-muted-foreground">{prDetail(a)}</span>
                </li>
              ))}
            </ul>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
