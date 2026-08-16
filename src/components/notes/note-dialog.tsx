"use client";

import { useState, useTransition } from "react";
import { Pencil, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { toDateInputValue } from "@/lib/format";
import { createNoteAction, updateNoteAction } from "@/lib/actions/note";
import type { NoteDTO } from "@/lib/dto";

export function NoteDialog({ note }: { note?: NoteDTO }) {
  const isEdit = Boolean(note);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const data = new FormData(event.currentTarget);
    const payload = {
      date: new Date(String(data.get("date"))),
      title: String(data.get("title") ?? "") || undefined,
      body: String(data.get("body") ?? ""),
    };

    startTransition(async () => {
      const result = isEdit
        ? await updateNoteAction({ id: note!.id, ...payload })
        : await createNoteAction(payload);
      if (result.ok) {
        toast({ title: isEdit ? "Note updated" : "Note added" });
        setOpen(false);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button variant="ghost" size="icon" aria-label="Edit note">
            <Pencil className="h-4 w-4 text-muted-foreground" />
          </Button>
        ) : (
          <Button>
            <Plus className="h-4 w-4" />
            New note
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit note" : "New training note"}</DialogTitle>
          <DialogDescription>
            Record how a session felt, coaching cues, or anything worth
            remembering.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                name="date"
                type="date"
                required
                defaultValue={
                  note ? toDateInputValue(note.date) : toDateInputValue()
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="title">Title (optional)</Label>
              <Input
                id="title"
                name="title"
                defaultValue={note?.title ?? ""}
                placeholder="Leg day"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="body">Note</Label>
            <Textarea
              id="body"
              name="body"
              required
              rows={5}
              defaultValue={note?.body ?? ""}
              placeholder="Felt strong on hip abduction, increased weight."
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : isEdit ? "Save changes" : "Add note"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
