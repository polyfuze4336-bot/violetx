"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy } from "lucide-react";

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
import { SHARE_EXPIRY_DAYS } from "@/lib/share-link";
import type { ShareLinkDTO } from "@/lib/services/shareLink";

export function ShareLinkManager({ links }: { links: ShareLinkDTO[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [label, setLabel] = useState("");
  const [days, setDays] = useState<number>(30);
  const [freshUrl, setFreshUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  function create(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await createShareLinkAction({
        label: label.trim() || undefined,
        expiresInDays: days as 7 | 30 | 90,
      });
      if (result.ok) {
        setFreshUrl(`${window.location.origin}/coach/${result.data.token}`);
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
    if (!freshUrl) return;
    await navigator.clipboard.writeText(freshUrl);
    setCopied(true);
  }

  return (
    <div className="space-y-5">
      <form onSubmit={create} className="grid gap-4 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
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
          <Label htmlFor="share-days">Expires after</Label>
          <select
            id="share-days"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {SHARE_EXPIRY_DAYS.map((d) => (
              <option key={d} value={d}>
                {d} days
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" disabled={isPending}>
          Create link
        </Button>
      </form>

      {freshUrl && (
        <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3">
          <p className="text-xs font-medium">
            Copy this link now — it is shown only once. Anyone with it can view
            your progress (read-only) until it expires or you revoke it.
          </p>
          <div className="flex gap-2">
            <Input readOnly value={freshUrl} onFocus={(e) => e.target.select()} />
            <Button type="button" variant="outline" onClick={copy}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              <span className="sr-only">Copy link</span>
            </Button>
          </div>
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
                  Created {formatDate(l.createdAt)} · expires{" "}
                  {formatDate(l.expiresAt)} · last viewed{" "}
                  {l.lastViewedAt ? formatDate(l.lastViewedAt) : "never"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant={l.status === "active" ? "default" : "secondary"}>
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
                    Revoke
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
