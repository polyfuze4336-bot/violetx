import { beforeEach, describe, expect, it, vi } from "vitest";

import { FakePrisma } from "@/test/fake-prisma";

vi.mock("next-auth", () => ({ getServerSession: vi.fn(), default: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: new Proxy({}, { get: (_t, p) => (globalThis as unknown as { __fake: FakePrisma }).__fake.client()[p as never] }),
}));

import { PDFDocument } from "pdf-lib";
import { getServerSession } from "next-auth";

import { GET } from "@/app/dashboard/export/progress/route";
import { buildProgressReport, type ReportSet } from "@/lib/progress-report";
import { pdfDate, pdfSafe, renderProgressPdf } from "@/lib/progress-pdf";
import { detectPrEvents } from "@/lib/analytics";
import { exerciseService } from "@/lib/services/exercise";
import { importService } from "@/lib/services/import";

const NOW = new Date("2026-10-11T08:00:00Z");

const set = (exerciseId: string, name: string, date: string, weightKg: number, reps: number, extra: Partial<ReportSet> = {}): ReportSet => ({
  date: `${date}T10:00:00.000Z`,
  exerciseId,
  exerciseName: name,
  weightKg,
  reps,
  assisted: false,
  source: "MANUAL",
  ...extra,
});

const sets: ReportSet[] = [
  set("bench", "Bench Press", "2026-08-01", 70, 8),
  set("bench", "Bench Press", "2026-08-15", 72.5, 8, { source: "WHATSAPP" }),
  set("bench", "Bench Press", "2026-09-01", 75, 8),
  set("bench", "Bench Press", "2026-09-15", 75, 10),
  set("chin", "Assisted Chin-Up", "2026-08-01", 40, 8, { assisted: true }),
  set("chin", "Assisted Chin-Up", "2026-09-01", 35, 8, { assisted: true }),
  set("chin", "Assisted Chin-Up", "2026-09-20", 35, 10, { assisted: true }),
];
const prEvents = detectPrEvents(sets.map((s, i) => ({ ...s, position: i })));

describe("coach progress report (data)", () => {
  const report = buildProgressReport({ sets, prEvents, now: NOW, athleteLabel: "Patient X" });

  it("is built only from recorded sets and the PR engine", () => {
    expect(report.athleteLabel).toBe("Patient X");
    expect(report.totals).toMatchObject({ exercises: 2, sets: 7, daysRecorded: 5, fromWhatsApp: 1 });
    const bench = report.exercises.find((e) => e.name === "Bench Press")!;
    expect(bench.best).toEqual({ weightKg: 75, reps: 10, date: "2026-09-15" });
    expect(bench.mostReps).toMatchObject({ reps: 10, weightKg: 75 });
    expect(bench.estimatedOneRepMaxKg).toBe(100); // 75 × (1 + 10/30), calculated and labelled in the PDF
    expect(bench.prs.map((p) => p.label)).toEqual(["Rep PR", "Weight PR", "Weight PR"]);
    expect(bench.prs[0]).toMatchObject({ result: "75 kg x 10", change: "+2 reps at 75 kg" });
    expect(bench.loadChange).toBe("70 kg -> 75 kg");
    expect(bench.trend.map((t) => t.weightKg)).toEqual([70, 72.5, 75, 75]);
  });

  it("assisted lifts: lowest assistance is best, no 1RM, plain-language PRs", () => {
    const chin = report.exercises.find((e) => e.name === "Assisted Chin-Up")!;
    expect(chin).toMatchObject({ assisted: true, estimatedOneRepMaxKg: null });
    expect(chin.best).toMatchObject({ weightKg: 35, reps: 10 });
    expect(chin.prs.map((p) => p.label)).toEqual(expect.arrayContaining(["Assistance PR", "Rep PR"]));
    expect(chin.prs.find((p) => p.label === "Assistance PR")!.change).toMatch(/5 kg less assistance/);
    expect(chin.loadChange).toBe("40 kg -> 35 kg assistance");
  });

  it("can be limited to one exercise", () => {
    const one = buildProgressReport({ sets, prEvents, exerciseId: "chin", now: NOW, athleteLabel: "Patient X" });
    expect(one.scope).toBe("Assisted Chin-Up");
    expect(one.exercises.map((e) => e.name)).toEqual(["Assisted Chin-Up"]);
    expect(one.totals.sets).toBe(3);
  });

  it("contains no ids, emails, notes or other private fields", () => {
    const json = JSON.stringify(report);
    expect(json).not.toMatch(/"bench"|"chin"|@|athleteId|userId|password/i);
  });

  it("an empty history gives an empty, honest report", () => {
    const empty = buildProgressReport({ sets: [], prEvents: [], now: NOW, athleteLabel: "Patient X" });
    expect(empty.exercises).toEqual([]);
    expect(empty.totals).toMatchObject({ exercises: 0, sets: 0, prs: 0 });
  });
});

describe("coach progress report (PDF)", () => {
  it("renders a valid PDF with the report's title and a page footer", async () => {
    const report = buildProgressReport({ sets, prEvents, now: NOW, athleteLabel: "Patient X" });
    const bytes = await renderProgressPdf(report);
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getTitle()).toBe("VioletX progress report - All exercises");
    expect(doc.getPageCount()).toBe(1);
  });

  it("paginates a long history instead of overflowing", async () => {
    const many: ReportSet[] = [];
    for (let i = 0; i < 40; i++) {
      many.push(set(`e${i}`, `Exercise number ${i}`, "2026-08-01", 50, 8), set(`e${i}`, `Exercise number ${i}`, "2026-09-01", 55, 8));
    }
    const report = buildProgressReport({ sets: many, prEvents: detectPrEvents(many.map((s, i) => ({ ...s, position: i }))), now: NOW, athleteLabel: "Patient X" });
    const doc = await PDFDocument.load(await renderProgressPdf(report));
    expect(doc.getPageCount()).toBeGreaterThan(2);
  });

  it("renders an empty history and text outside Latin-1 without throwing", async () => {
    const empty = buildProgressReport({ sets: [], prEvents: [], now: NOW, athleteLabel: "Patient X" });
    expect((await PDFDocument.load(await renderProgressPdf(empty))).getPageCount()).toBe(1);
    const odd = buildProgressReport({ sets: [set("x", "Press → “Überkopf” 💪", "2026-09-01", 40, 8), set("x", "Press → “Überkopf” 💪", "2026-09-08", 42.5, 8)], prEvents: [], now: NOW, athleteLabel: "Patient X" });
    expect((await renderProgressPdf(odd)).byteLength).toBeGreaterThan(500);
    expect(pdfSafe("A → B – “c” 💪 Ü")).toBe('A -> B - "c" ? Ü');
    expect(pdfDate("2026-09-05")).toBe("5 Sep 2026");
  });
});

describe("GET /dashboard/export/progress", () => {
  const session = vi.mocked(getServerSession);
  let fake: FakePrisma;

  beforeEach(async () => {
    fake = new FakePrisma(
      {
        user: [{ id: "owner-1", email: "owner@example.com", role: "OWNER", active: true }],
        athlete: [{ id: "athlete-1", ownerUserId: "owner-1", displayName: "Patient X", defaultWeightUnit: "KG", defaultMeasurementUnit: "CM" }],
      },
      true
    );
    (globalThis as unknown as { __fake: FakePrisma }).__fake = fake;
    session.mockReset();
    process.env.DEMO_MODE_ENABLED = "true";
    session.mockResolvedValue({ user: { id: "owner-1", email: "owner@example.com", role: "OWNER", athleteId: "athlete-1" }, expires: "2999-01-01T00:00:00.000Z" });
    await exerciseService.seedStarterLibrary();
    const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
    for (const [n, w, r] of [[30, 70, 8], [15, 75, 8], [2, 75, 10]] as const) {
      await importService.commit({ date: new Date(`${day(n)}T00:00:00Z`), importType: "FULL", weightResolution: "IMPORT", measurements: [], sets: [{ exercise: "Barbell Bench Press", reps: r, weightKg: w, resolution: "IMPORT" }] });
    }
    fake.writes.length = 0;
  });

  it("returns a PDF attachment of the athlete's recorded progress", async () => {
    const res = await GET(new Request("http://localhost/dashboard/export/progress"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="violetx-progress-\d{4}-\d{2}-\d{2}\.pdf"$/);
    expect(res.headers.get("cache-control")).toContain("no-store");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThanOrEqual(1);
    expect(fake.writes).toEqual([]);
  });

  it("can export one exercise, ignores malformed ids, and needs a session", async () => {
    const lib = (fake.tables.exercise as { id: string; name: string }[]).find((e) => e.name === "Barbell Bench Press")!;
    expect((await GET(new Request(`http://localhost/dashboard/export/progress?exercise=${lib.id}`))).status).toBe(200);
    expect((await GET(new Request("http://localhost/dashboard/export/progress?exercise=../../etc/passwd"))).status).toBe(200);
    session.mockResolvedValue(null);
    const anon = await GET(new Request("http://localhost/dashboard/export/progress"));
    expect(anon.status).toBe(401);
    expect(anon.headers.get("content-type")).toContain("application/json");
  });

  it("a read-only coach or demo viewer can export what they can already see", async () => {
    for (const role of ["COACH", "DEMO_VIEWER"]) {
      session.mockResolvedValue({ user: { id: `${role}-1`, email: `${role}@example.com`, role, athleteId: "athlete-1" }, expires: "2999-01-01T00:00:00.000Z" });
      expect((await GET(new Request("http://localhost/dashboard/export/progress"))).status).toBe(200);
    }
    expect(fake.writes).toEqual([]);
  });
});
