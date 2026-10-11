"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bug, Lightbulb } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { submitFeedbackAction } from "@/lib/actions/feedback";

const KINDS = [
  { key: "BUG", label: "Report a bug", icon: Bug, hint: "Something is broken or looks wrong." },
  { key: "FEATURE", label: "Request a feature", icon: Lightbulb, hint: "Something you would like VioletX to do." },
] as const;

export function FeedbackForm({ from }: { from?: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [kind, setKind] = useState<"BUG" | "FEATURE">("BUG");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    startTransition(async () => {
      const res = await submitFeedbackAction({ kind, title, details, page: from });
      if (res.ok) {
        toast({ title: "Thank you", description: kind === "BUG" ? "Your bug report was sent." : "Your feature request was sent." });
        setTitle("");
        setDetails("");
        router.refresh();
      } else {
        setErrors(res.fieldErrors ?? {});
        toast({ title: "Could not send", description: res.error, variant: "destructive" });
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div role="radiogroup" aria-label="Type" className="grid gap-2 sm:grid-cols-2">
        {KINDS.map((k) => (
          <button
            key={k.key}
            type="button"
            role="radio"
            aria-checked={kind === k.key}
            onClick={() => setKind(k.key)}
            className={cn("flex items-start gap-3 rounded-xl border p-3 text-left transition-colors", kind === k.key ? "border-primary bg-primary/10" : "hover:bg-muted")}
          >
            <k.icon className="mt-0.5 h-4 w-4 text-primary" />
            <span>
              <span className="block text-sm font-semibold">{k.label}</span>
              <span className="block text-xs text-muted-foreground">{k.hint}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="space-y-2">
        <Label htmlFor="fb-title">Title</Label>
        <Input id="fb-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder={kind === "BUG" ? "e.g. PR does not show after import" : "e.g. Export my workouts to Excel"} />
        {errors.title && <p className="text-xs text-destructive">{errors.title[0]}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="fb-details">{kind === "BUG" ? "What happened, and what did you expect?" : "What would you like, and why?"}</Label>
        <Textarea id="fb-details" rows={5} value={details} onChange={(e) => setDetails(e.target.value)} maxLength={2000} />
        {errors.details && <p className="text-xs text-destructive">{errors.details[0]}</p>}
      </div>
      {from && <p className="text-xs text-muted-foreground">Filed from {from.split("?")[0]}</p>}
      <p className="text-xs text-muted-foreground">Please do not include passwords or private health details.</p>
      <Button type="submit" disabled={isPending}>
        {isPending ? "Sending…" : kind === "BUG" ? "Send bug report" : "Send feature request"}
      </Button>
    </form>
  );
}
