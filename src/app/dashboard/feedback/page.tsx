import { redirect } from "next/navigation";

import { requireAuth } from "@/lib/auth";
import { feedbackService, type FeedbackDTO } from "@/lib/services/feedback";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FeedbackForm } from "@/components/feedback/feedback-form";
import { FeedbackStatus } from "@/components/feedback/feedback-status";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

function Row({ r, triage }: { r: FeedbackDTO; triage: boolean }) {
  return (
    <li className="space-y-1 rounded-xl border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Badge variant="outline">{r.kind === "BUG" ? "Bug" : "Feature"}</Badge>
          {r.title}
        </p>
        {triage ? <FeedbackStatus id={r.id} status={r.status} /> : <Badge variant="secondary">{r.status.charAt(0) + r.status.slice(1).toLowerCase()}</Badge>}
      </div>
      <p className="whitespace-pre-wrap text-sm text-muted-foreground">{r.details}</p>
      <p className="text-xs text-muted-foreground">
        {formatDate(r.createdAt)}
        {r.page ? ` · ${r.page}` : ""}
        {r.reporter ? ` · reporter ${r.reporter}` : ""}
      </p>
    </li>
  );
}

/** Report a bug or request a feature (athlete accounts only). */
export default async function FeedbackPage({ searchParams }: { searchParams: { from?: string } }) {
  const viewer = await requireAuth();
  if (viewer.role !== "OWNER") redirect("/dashboard");

  const [mine, all] = await Promise.all([feedbackService.listMine(), feedbackService.listAll()]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Report a bug or request a feature" description="Tell us what is broken or what you would like next." />
      <Card>
        <CardContent className="p-5">
          <FeedbackForm from={typeof searchParams.from === "string" ? searchParams.from : undefined} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your reports</CardTitle>
        </CardHeader>
        <CardContent>
          {mine.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing sent yet.</p>
          ) : (
            <ul className="space-y-3">
              {mine.map((r) => (
                <Row key={r.id} r={r} triage={false} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {all.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">All reports</CardTitle>
            <CardDescription>Visible to the primary owner only. Reporters are shown as a short code, never an email.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {all.map((r) => (
                <Row key={r.id} r={r} triage />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
