"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Link2, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  createShareLinkAction,
  revokeShareLinkAction,
} from "@/lib/actions/shareLink";
import { formatDate } from "@/lib/format";
import { MAX_CUSTOM_EXPIRY_DAYS, type ShareExpiry } from "@/lib/share-link";
import type { ShareLinkDTO } from "@/lib/services/shareLink";

type Choice = "never" | "7" | "30" | "custom";

const expiryText = (iso: string | null) => (iso ? formatDate(iso) : "Never");

export function ShareLinkManager({ links }: { links: ShareLinkDTO[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [label, setLabel] = useState("");
  const [choice, setChoice] = useState<Choice>("30");
  const [customDays, setCustomDays] = useState("14");
  const [fresh, setFresh] = useState<{ url: string; link: ShareLinkDTO } | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  function expiry(): ShareExpiry | null {
    if (choice === "never") return "never";
    if (choice === "custom") {
      const n = Number(customDays);
      return Number.isInteger(n) && n >= 1 && n <= MAX_CUSTOM_EXPIRY_DAYS ? n : null;
    }
    return Number(choice);
  }

  function create(e: React.FormEvent) {
    e.preventDefault();
    const expiresInDays = expiry();
    if (expiresInDays === null) {
      toast({
        title: "Check the expiry",
        description: `Enter a whole number of days from 1 to ${MAX_CUSTOM_EXPIRY_DAYS}.`,
        variant: "destructive",
      });
      return;
    }
    startTransition(async () => {
      const result = await createShareLinkAction({
        label: label.trim() || undefined,
        expiresInDays,
      });
      if (result.ok) {
        setFresh({
          url: `${window.location.origin}/share/coach/${result.data.token}`,
          link: result.data.link,
        });
        setCopied(false);
        setLabel("");
        router.refresh();
      } else {
        toast({
          title: "Could not create link",
          description: result.error,
          variant: "destructive",
        });
      }
    });
  }

  function revoke(id: string) {
    startTransition(async () => {
      const result = await revokeShareLinkAction(id);
      if (result.ok) {
        toast({ title: "Link revoked" });
        setFresh((f) => (f && f.link.id === id ? { ...f, link: { ...f.link, status: "revoked" } } : f));
        router.refresh();
      } else {
        toast({
          title: "Could not revoke link",
          description: result.error,
          variant: "destructive",
        });
      }
    });
  }

  async function copy() {
    if (!fresh) return;
    await navigator.clipboard.writeText(fresh.url);
    setCopied(true);
  }

  return (
    <div className="space-y-5">
      <form onSubmit={create} className="grid gap-4 sm:grid-cols-[1fr_11rem_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="share-label">Label (optional)</Label>
          <Input
            id="share-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={100}
            placeholder="e.g. Coach Sam"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="share-days">Expiry</Label>
          <select
            id="share-days"
            value={choice}
            onChange={(e) => setChoice(e.target.value as Choice)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="never">Never</option>
            <option value="7">7 days</option>
            <option value="30">30 days</option>
            <option value="custom">Custom…</option>
          </select>
        </div>
        <Button type="submit" disabled={isPending}>
          <Link2 className="h-4 w-4" /> Create Coach Link
        </Button>
        {choice === "custom" && (
          <div className="space-y-1.5 sm:col-span-3 sm:max-w-[11rem]">
            <Label htmlFor="share-custom">Days (1–{MAX_CUSTOM_EXPIRY_DAYS})</Label>
            <Input
              id="share-custom"
              type="number"
              min={1}
              max={MAX_CUSTOM_EXPIRY_DAYS}
              value={customDays}
              onChange={(e) => setCustomDays(e.target.value)}
            />
          </div>
        )}
      </form>

      {fresh && (
        <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck className="h-4 w-4 text-primary" /> Coach Progress Link
            </p>
            <Badge variant={fresh.link.status === "active" ? "default" : "secondary"} className="uppercase">
              {fresh.link.status}
            </Badge>
          </div>
          <div className="flex gap-2">
            <Input readOnly value={fresh.url} onFocus={(e) => e.target.select()} aria-label="Coach progress link" />
            <Button type="button" variant="outline" onClick={copy}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              <span className="ml-1.5">{copied ? "Copied" : "Copy Link"}</span>
            </Button>
          </div>
          <dl className="grid grid-cols-2 gap-2 text-xs sm:max-w-sm">
            <div>
              <dt className="text-muted-foreground">Created</dt>
              <dd className="font-medium">{formatDate(fresh.link.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Expires</dt>
              <dd className="font-medium">{expiryText(fresh.link.expiresAt)}</dd>
            </div>
          </dl>
          <p className="text-xs text-muted-foreground">
            Copy it now: for your safety only a fingerprint of the link is stored, so it cannot be shown again. Anyone with
            it can view your progress read-only until it expires or you revoke it.
          </p>
          {fresh.link.status === "active" && (
            <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={() => revoke(fresh.link.id)}>
              Revoke Link
            </Button>
          )}
        </div>
      )}

      {links.length > 0 && (
        <ul className="divide-y rounded-md border">
          {links.map((l) => (
            <li
              key={l.id}
              className="flex items-center justify-between gap-3 p-3 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{l.label ?? "Coach link"}</p>
                <p className="text-xs text-muted-foreground">
                  Created {formatDate(l.createdAt)} · expires {expiryText(l.expiresAt)} · last viewed{" "}
                  {l.lastViewedAt ? formatDate(l.lastViewedAt) : "never"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant={l.status === "active" ? "default" : "secondary"} className="uppercase">
                  {l.status}
                </Badge>
                {l.status === "active" && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isPending}
                    onClick={() => revoke(l.id)}
                  >
                    Revoke Link
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
