"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import type { ActionResult } from "@/lib/actions/helpers";

export function ConfirmDeleteButton({
  onConfirm,
  title = "Delete this record?",
  description = "This action cannot be undone.",
  label = "Delete",
}: {
  onConfirm: () => Promise<ActionResult>;
  title?: string;
  description?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  function handleDelete() {
    startTransition(async () => {
      const result = await onConfirm();
      if (result.ok) {
        toast({ title: "Deleted", description: "The record was removed." });
        setOpen(false);
      } else {
        toast({
          title: "Could not delete",
          description: result.error,
          variant: "destructive",
        });
      }
    });
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        aria-label={label}
      >
        <Trash2 className="h-4 w-4 text-muted-foreground" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isPending}
            >
              {isPending ? "Deleting…" : label}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
