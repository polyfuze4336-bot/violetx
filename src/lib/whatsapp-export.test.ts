import { describe, expect, it } from "vitest";

import {
  groupExportMessages,
  readWhatsAppExport,
} from "@/lib/whatsapp-export";

const IOS = `[16/08/2026, 10:34:12 PM] Messages and calls are end-to-end encrypted.
[16/08/2026, 10:35:01 PM] Patient: Gym update

Weight - 74.2kg
Waist - 38.5
Hip abduction 9x50kg
[16/08/2026, 10:36:00 PM] Patient: <Media omitted>
[17/08/2026, 7:05:00 AM] Coach Sam: ok 5 great job
[18/08/2026, 6:00:00 PM] Patient: Hip adduction 3 x 43kg`;

const KNOWN = ["Waist", "Hip"];

describe("readWhatsAppExport", () => {
  it("parses iOS exports, joins multi-line messages and skips system/media lines", () => {
    const { messages, senders } = readWhatsAppExport(IOS);
    expect(senders).toEqual(["Coach Sam", "Patient"]);
    const first = messages[0];
    expect(first.date).toBe("2026-08-16");
    expect(first.sender).toBe("Patient");
    expect(first.text).toContain("Waist - 38.5");
    expect(first.text).toContain("Hip abduction 9x50kg");
    expect(messages.some((m) => /media omitted/i.test(m.text))).toBe(false);
  });

  it("parses Android exports with invisible characters", () => {
    const txt =
      "16/08/2026, 22:35 - Patient: Weight - 74.2kg\n\u200e17/08/2026, 22:35 - Patient: Hip abduction 9x50kg";
    const { messages } = readWhatsAppExport(txt);
    expect(messages.map((m) => m.date)).toEqual(["2026-08-16", "2026-08-17"]);
  });

  it("detects month-first dates when the data proves it", () => {
    const txt = "8/16/26, 10:35 PM - Patient: Weight - 74kg\n8/3/26, 10:35 PM - Patient: Weight - 73kg";
    const { messages } = readWhatsAppExport(txt);
    expect(messages.map((m) => m.date)).toEqual(["2026-08-16", "2026-08-03"]);
  });

  it("defaults to day-first when ambiguous", () => {
    const { messages } = readWhatsAppExport(
      "[03/08/2026, 10:35 AM] Patient: Weight - 74kg"
    );
    expect(messages[0].date).toBe("2026-08-03");
  });
});

describe("groupExportMessages", () => {
  const { messages } = readWhatsAppExport(IOS);

  it("groups structured records by day, ignoring chat noise", () => {
    const days = groupExportMessages(messages, { knownMeasurementNames: KNOWN });
    expect(days.map((d) => d.date)).toEqual(["2026-08-16", "2026-08-18"]);
    expect(days[0].weightKg).toBe(74.2);
    expect(days[0].measurements.map((m) => m.name)).toEqual(["Waist"]);
    expect(days[0].sets).toEqual([
      { exercise: "Hip Abduction", reps: 9, weightKg: 50 },
    ]);
    // "ok 5 great job" must not become a measurement or a day.
    expect(days.find((d) => d.date === "2026-08-17")).toBeUndefined();
  });

  it("ignores unknown measurement names", () => {
    const days = groupExportMessages(messages, { knownMeasurementNames: [] });
    expect(days[0].measurements).toHaveLength(0);
  });

  it("filters by sender", () => {
    const days = groupExportMessages(messages, {
      senders: ["Coach Sam"],
      knownMeasurementNames: KNOWN,
    });
    expect(days).toHaveLength(0);
  });

  it("prefers a date written inside the message", () => {
    const { messages: m } = readWhatsAppExport(
      "[20/08/2026, 9:00:00 AM] Patient: Update 12 Aug\nWeight - 75kg"
    );
    const days = groupExportMessages(m, { knownMeasurementNames: KNOWN });
    expect(days[0].date).toBe("2026-08-12");
  });

  it("rejects implausible weights and rep counts", () => {
    const { messages: m } = readWhatsAppExport(
      "[20/08/2026, 9:00:00 AM] Patient: Weight - 5kg\n[20/08/2026, 9:01:00 AM] Patient: Squat 500x20kg"
    );
    expect(groupExportMessages(m, { knownMeasurementNames: KNOWN })).toEqual([]);
  });
});
