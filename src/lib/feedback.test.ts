import { beforeEach, describe, expect, it, vi } from "vitest";

import { FakePrisma } from "@/test/fake-prisma";

vi.mock("next-auth", () => ({ getServerSession: vi.fn(), default: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: new Proxy({}, { get: (_t, p) => (globalThis as unknown as { __fake: FakePrisma }).__fake.client()[p as never] }),
}));
const trackEvent = vi.fn();
vi.mock("@/lib/telemetry", () => ({ trackEvent: (...a: unknown[]) => trackEvent(...a), trackException: vi.fn(), initTelemetry: vi.fn() }));

import { getServerSession } from "next-auth";

import { submitFeedbackAction, setFeedbackStatusAction } from "@/lib/actions/feedback";
import { AuthenticationError, AuthorizationError } from "@/lib/rbac";
import { submitFeedbackSchema } from "@/lib/schemas";
import { feedbackService } from "@/lib/services/feedback";

const session = vi.mocked(getServerSession);
let fake: FakePrisma;
const rows = () => (fake.tables.feedbackReport ?? []) as Record<string, unknown>[];
const as = (role: string, id: string, email: string) =>
  session.mockResolvedValue({ user: { id, email, role, athleteId: "a1" }, expires: "2999-01-01T00:00:00.000Z" });
const primary = () => as("OWNER", "owner-primary-000001", "owner@example.com");
const secondOwner = () => as("OWNER", "owner-second-000002", "juanny_johari@yahoo.com");

const valid = { kind: "BUG" as const, title: "PR missing after import", details: "I imported a WhatsApp update and the PR did not show on Home.", page: "/dashboard/records?x=1" };

beforeEach(() => {
  fake = new FakePrisma({}, true);
  (globalThis as unknown as { __fake: FakePrisma }).__fake = fake;
  session.mockReset();
  trackEvent.mockReset();
  process.env.OWNER_EMAIL = "owner@example.com";
  process.env.DEMO_MODE_ENABLED = "true";
  primary();
});

describe("bug reports and feature requests", () => {
  it("saves a bug report with only an in-app path (no query string)", async () => {
    const r = await feedbackService.submit(valid);
    expect(r).toMatchObject({ kind: "BUG", title: "PR missing after import", status: "OPEN", page: "/dashboard/records", reporter: null });
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatchObject({ userId: "owner-primary-000001", kind: "BUG" });
  });

  it("saves a feature request", async () => {
    const r = await feedbackService.submit({ kind: "FEATURE", title: "Export to Excel", details: "Please let me export every workout to a spreadsheet." });
    expect(r).toMatchObject({ kind: "FEATURE", page: null });
  });

  it("validates the text and ignores unsafe pages", () => {
    expect(() => submitFeedbackSchema.parse({ ...valid, title: "x" })).toThrow();
    expect(() => submitFeedbackSchema.parse({ ...valid, details: "too short" })).toThrow();
    expect(() => submitFeedbackSchema.parse({ ...valid, details: "x".repeat(2001) })).toThrow();
    expect(() => submitFeedbackSchema.parse({ ...valid, kind: "OTHER" })).toThrow();
    expect(submitFeedbackSchema.parse({ ...valid, page: "https://evil.example/x" }).page).toBeUndefined();
    expect(submitFeedbackSchema.parse({ ...valid, page: "//evil.example" }).page).toBeUndefined();
    expect(submitFeedbackSchema.parse({ ...valid, page: "/dashboard/gym#top" }).page).toBe("/dashboard/gym");
  });

  it("the server action returns field errors for bad input and writes nothing", async () => {
    const res = await submitFeedbackAction({ ...valid, title: "x" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.fieldErrors?.title).toBeTruthy();
    expect(rows()).toHaveLength(0);
  });

  it("only the athlete can submit: the demo viewer, a coach and anonymous visitors are refused", async () => {
    as("DEMO_VIEWER", "demo-1", "demo@violetx.demo");
    await expect(feedbackService.submit(valid)).rejects.toBeInstanceOf(AuthorizationError);
    as("COACH", "coach-1", "coach@example.com");
    await expect(feedbackService.submit(valid)).rejects.toBeInstanceOf(AuthorizationError);
    session.mockResolvedValue(null);
    await expect(feedbackService.submit(valid)).rejects.toBeInstanceOf(AuthenticationError);
    const direct = await submitFeedbackAction(valid);
    expect(direct.ok).toBe(false);
    expect(rows()).toHaveLength(0);
  });

  it("limits how many reports one account can send per day", async () => {
    for (let i = 0; i < 20; i++) await feedbackService.submit({ ...valid, title: `Report ${i + 1}` });
    await expect(feedbackService.submit(valid)).rejects.toBeInstanceOf(AuthorizationError);
    secondOwner();
    await expect(feedbackService.submit(valid)).resolves.toBeTruthy(); // another account is unaffected
  });

  it("telemetry only records that a report was filed, never its text", async () => {
    await feedbackService.submit(valid);
    expect(trackEvent).toHaveBeenCalledWith("feedback.submitted", { kind: "BUG" });
    expect(JSON.stringify(trackEvent.mock.calls)).not.toContain("WhatsApp");
  });

  it("each owner sees only their own reports", async () => {
    await feedbackService.submit(valid);
    secondOwner();
    await feedbackService.submit({ ...valid, title: "Second user's report" });
    const mine = await feedbackService.listMine();
    expect(mine.map((r) => r.title)).toEqual(["Second user's report"]);
    expect(await feedbackService.listAll()).toEqual([]); // not the primary owner
    primary();
    expect((await feedbackService.listMine()).map((r) => r.title)).toEqual(["PR missing after import"]);
  });

  it("the primary owner can triage everything, but reporters are anonymous codes, never emails", async () => {
    await feedbackService.submit(valid);
    secondOwner();
    await feedbackService.submit({ ...valid, title: "Second user's report" });
    primary();
    const all = await feedbackService.listAll();
    expect(all).toHaveLength(2);
    expect(JSON.stringify(all)).not.toMatch(/@|yahoo|example\.com/);
    expect(all.every((r) => /^[\w-]{6}$/.test(r.reporter ?? ""))).toBe(true);

    const id = all[0].id;
    await feedbackService.setStatus({ id, status: "PLANNED" });
    expect(rows().find((r) => r.id === id)!.status).toBe("PLANNED");
    await expect(feedbackService.setStatus({ id, status: "WHATEVER" })).rejects.toThrow();
  });

  it("another owner cannot change a report's status", async () => {
    const r = await feedbackService.submit(valid);
    secondOwner();
    await expect(feedbackService.setStatus({ id: r.id, status: "DONE" })).rejects.toBeInstanceOf(AuthorizationError);
    expect((await setFeedbackStatusAction({ id: r.id, status: "DONE" })).ok).toBe(false);
    expect(rows()[0].status).toBe("OPEN");
  });
});
