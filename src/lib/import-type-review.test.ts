import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/actions/import", () => ({ assessImportAction: vi.fn() }));

import { ImportTypeReview, type ReviewSet } from "@/components/import/import-type-review";
import { recommendImportType } from "@/lib/import-interpretation";

const set = (exercise: string, reps: number, weightKg: number, extra: Partial<ReviewSet> = {}): ReviewSet => ({
  exercise,
  reps: String(reps),
  weightKg: String(weightKg),
  unresolved: false,
  ...extra,
});

function html(sets: ReviewSet[], type: "PR_UPDATE" | "PARTIAL" | "FULL", compact = false) {
  const recommendation = recommendImportType({ sets: sets.map((s) => ({ exercise: s.exercise, prClaim: s.prClaim })) });
  return renderToStaticMarkup(
    createElement(ImportTypeReview, { date: "2026-08-16", sets, type, onChange: () => undefined, recommendation, compact })
  );
}

describe("import review: choose what the message represents", () => {
  const pr = [set("Bench Press", 10, 80), set("Assisted Chin-Up", 10, 25)];

  it("explains what Violet detected and offers the three import types", () => {
    const out = html(pr, "PR_UPDATE");
    expect(out).toContain("Violet detected: 2 exercises · 2 performance entries");
    expect(out).toContain("Likely: <strong");
    expect(out).toContain("PR / Progress Update");
    expect(out).toContain("selected exercise progress rather than a complete workout");
    expect(out).toContain('role="radiogroup"');
    expect(out.match(/role="radio"/g)).toHaveLength(3);
    for (const label of ["PR / Progress Update", "Partial Workout", "Full Workout"]) expect(out).toContain(label);
  });

  it("marks only the chosen type as selected, and the user's choice wins over the suggestion", () => {
    const full = html(pr, "FULL");
    const checked = Array.from(full.matchAll(/<button[^>]*role="radio"[^>]*aria-checked="(true|false)"[^>]*>([\s\S]*?)<\/button>/g));
    expect(checked.map((m) => [m[1], /Full Workout/.test(m[2])])).toEqual(
      expect.arrayContaining([["true", true]])
    );
    expect(checked.filter((m) => m[1] === "true")).toHaveLength(1);
  });

  it("says plainly that missing exercises are not skipped, except for a full workout", () => {
    expect(html(pr, "PR_UPDATE")).toMatch(/does not treat missing exercises as skipped/);
    expect(html(pr, "PARTIAL")).toMatch(/does not treat missing exercises as skipped/);
    expect(html(pr, "FULL")).not.toMatch(/does not treat missing exercises as skipped/);
  });

  it("lists each performance and waits for the PR check before announcing anything", () => {
    const out = html(pr, "PR_UPDATE");
    expect(out).toContain("Bench Press");
    expect(out).toContain("80 kg × 10");
    expect(out).toContain("Checking…");
    expect(out).not.toContain("Confirmed");
  });

  it("renders nothing until there is a valid set to review", () => {
    expect(html([set("", 0, 0, { reps: "", weightKg: "" })], "PARTIAL")).toBe("");
  });

  it("stacks the options in narrow containers (Violet chat)", () => {
    expect(html(pr, "PR_UPDATE", true)).not.toContain("sm:grid-cols-3");
    expect(html(pr, "PR_UPDATE", false)).toContain("sm:grid-cols-3");
  });
});
