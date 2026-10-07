import { describe, expect, it } from "vitest";

import { todayIso, weekdayIn } from "@/lib/dates";

describe("athlete-local dates", () => {
  it("uses the Malaysia day even when UTC is still the previous day", () => {
    const now = new Date("2026-08-19T20:30:00Z"); // 04:30 on the 20th in Kuala Lumpur
    expect(todayIso(now, "Asia/Kuala_Lumpur")).toBe("2026-08-20");
    expect(todayIso(now, "UTC")).toBe("2026-08-19");
    expect(weekdayIn(now, "Asia/Kuala_Lumpur")).toBe(4); // Thursday
  });
});
