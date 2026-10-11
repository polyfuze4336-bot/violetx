"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { useToast } from "@/hooks/use-toast";
import { setFeedbackStatusAction } from "@/lib/actions/feedback";
import { FEEDBACK_STATUSES } from "@/lib/schemas";

/** Triage control for the primary owner. */
export function FeedbackStatus({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  return (
    <select
      aria-label="Status"
      value={status}
      disabled={pending}
      onChange={(e) =>
        start(async () => {
          const res = await setFeedbackStatusAction({ id, status: e.target.value });
          if (res.ok) router.refresh();
          else toast({ title: "Could not update", description: res.error, variant: "destructive" });
        })
      }
      className="h-8 rounded-md border bg-background px-2 text-xs"
    >
      {FEEDBACK_STATUSES.map((s) => (
        <option key={s} value={s}>
          {s.charAt(0) + s.slice(1).toLowerCase()}
        </option>
      ))}
    </select>
  );
}
