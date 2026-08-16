import Link from "next/link";
import { GitCompareArrows, History as HistoryIcon } from "lucide-react";

import { requireAuth } from "@/lib/auth";
import { bodyWeightService } from "@/lib/services/bodyWeight";
import { measurementService } from "@/lib/services/measurement";
import { exerciseEntryService } from "@/lib/services/exercise";
import { noteService } from "@/lib/services/note";
import { personalRecordService } from "@/lib/services/personalRecord";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { NoteDialog } from "@/components/notes/note-dialog";
import { HistoryTimeline } from "@/components/history/history-timeline";

export default async function HistoryPage() {
  const viewer = await requireAuth();
  const isOwner = viewer.role === "OWNER";

  const [weights, measurements, sets, notes, prEvents] = viewer.athleteId
    ? await Promise.all([
        bodyWeightService.list(),
        measurementService.listEntries(),
        exerciseEntryService.list(),
        noteService.list(),
        personalRecordService.prEvents(),
      ])
    : [[], [], [], [], []];

  const isEmpty =
    weights.length === 0 &&
    measurements.length === 0 &&
    sets.length === 0 &&
    notes.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="History"
        description="A day-by-day record of everything you've logged."
        action={
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href="/dashboard/compare">
                <GitCompareArrows className="h-4 w-4" />
                Compare
              </Link>
            </Button>
            {isOwner && <NoteDialog />}
          </div>
        }
      />

      {isEmpty ? (
        <EmptyState
          icon={HistoryIcon}
          title="Nothing logged yet"
          description={
            isOwner
              ? "Your activity timeline will appear here as you add data."
              : "The athlete has not logged any activity yet."
          }
        />
      ) : (
        <HistoryTimeline
          weights={weights}
          measurements={measurements}
          sets={sets}
          notes={notes}
          prEvents={prEvents}
        />
      )}
    </div>
  );
}
