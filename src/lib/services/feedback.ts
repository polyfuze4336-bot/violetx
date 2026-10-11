import { prisma } from "@/lib/db";
import { requireOwner } from "@/lib/auth";
import { AuthorizationError, NotFoundError } from "@/lib/rbac";
import { isPrimaryOwner } from "@/lib/services/userAdmin";
import { trackEvent } from "@/lib/telemetry";
import {
  setFeedbackStatusSchema,
  submitFeedbackSchema,
  type SubmitFeedbackInput,
} from "@/lib/schemas";

export interface FeedbackDTO {
  id: string;
  kind: "BUG" | "FEATURE";
  title: string;
  details: string;
  page: string | null;
  status: string;
  createdAt: string;
  /** Short anonymous code of the reporter, shown to the primary owner only. */
  reporter: string | null;
}

/** Per user and day: stops a runaway client from filling the table. */
const DAILY_LIMIT = 20;

const toDto = (r: { id: string; userId: string; kind: string; title: string; details: string; page: string | null; status: string; createdAt: Date }, withReporter: boolean): FeedbackDTO => ({
  id: r.id,
  kind: r.kind === "FEATURE" ? "FEATURE" : "BUG",
  title: r.title,
  details: r.details,
  page: r.page,
  status: r.status,
  createdAt: r.createdAt.toISOString(),
  reporter: withReporter ? r.userId.slice(-6) : null,
});

export const feedbackService = {
  /** Any signed-in owner may report a bug or ask for a feature. Never the demo viewer. */
  async submit(input: SubmitFeedbackInput): Promise<FeedbackDTO> {
    const actor = await requireOwner();
    const data = submitFeedbackSchema.parse(input);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recent = await prisma.feedbackReport.count({ where: { userId: actor.userId, createdAt: { gte: since } } });
    if (recent >= DAILY_LIMIT) throw new AuthorizationError("You have sent a lot of reports today. Please try again tomorrow.");
    const row = await prisma.feedbackReport.create({
      data: { userId: actor.userId, kind: data.kind, title: data.title, details: data.details, page: data.page ?? null, status: "OPEN", createdAt: new Date() },
    });
    // The text is never sent to telemetry: only that a report was filed.
    trackEvent("feedback.submitted", { kind: data.kind });
    return toDto(row, false);
  },

  /** The signed-in owner's own reports, newest first. */
  async listMine(): Promise<FeedbackDTO[]> {
    const actor = await requireOwner();
    const rows = await prisma.feedbackReport.findMany({ where: { userId: actor.userId }, orderBy: { createdAt: "desc" }, take: 50 });
    return rows.map((r) => toDto(r, false));
  },

  /** Primary owner only: every report, to triage. Other owners get an empty list. */
  async listAll(): Promise<FeedbackDTO[]> {
    const actor = await requireOwner();
    if (!isPrimaryOwner(actor.email)) return [];
    const rows = await prisma.feedbackReport.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
    return rows.map((r) => toDto(r, true));
  },

  async setStatus(input: { id: string; status: string }): Promise<void> {
    const actor = await requireOwner();
    if (!isPrimaryOwner(actor.email)) throw new AuthorizationError("Only the primary owner can change a report's status.");
    const data = setFeedbackStatusSchema.parse(input);
    const res = await prisma.feedbackReport.updateMany({ where: { id: data.id }, data: { status: data.status } });
    if (res.count === 0) throw new NotFoundError("Report not found.");
  },
};
