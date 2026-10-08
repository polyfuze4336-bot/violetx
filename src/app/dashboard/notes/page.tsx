import { NotebookPen } from "lucide-react";

import { requireAuth } from "@/lib/auth";
import { noteService } from "@/lib/services/note";
import { deleteNoteAction } from "@/lib/actions/note";
import { formatDate } from "@/lib/format";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { ConfirmDeleteButton } from "@/components/dashboard/delete-button";
import { NoteDialog } from "@/components/notes/note-dialog";
import { showsOwnerUi } from "@/lib/rbac";

export default async function NotesPage() {
  const viewer = await requireAuth();
  const isOwner = showsOwnerUi(viewer.role);
  const notes = viewer.athleteId ? await noteService.list() : [];

  return (
    <div>
      <PageHeader
        title="Training notes"
        description="Context and reflections tied to a date."
        action={isOwner ? <NoteDialog /> : undefined}
      />

      {notes.length === 0 ? (
        <EmptyState
          icon={NotebookPen}
          title="No notes yet"
          description={
            isOwner
              ? "Add your first training note."
              : "The athlete has not written any notes yet."
          }
        />
      ) : (
        <div className="grid gap-4">
          {notes.map((note) => (
            <Card key={note.id}>
              <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {formatDate(note.date)}
                  </p>
                  {note.title && (
                    <h3 className="font-semibold">{note.title}</h3>
                  )}
                </div>
                {isOwner && (
                  <div className="flex items-center">
                    <NoteDialog note={note} />
                    <ConfirmDeleteButton
                      onConfirm={deleteNoteAction.bind(null, note.id)}
                      title="Delete this note?"
                    />
                  </div>
                )}
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {note.body}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
