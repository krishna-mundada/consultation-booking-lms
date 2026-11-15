import { describe, expect, it } from "vitest";
import { calendarParts, formatConsultationTime, relativeDay } from "@/lib/dates";

// Every time the app shows is in Australia/Melbourne with its zone label (ADR 0007, A11), whatever zone the
// viewer's browser is in. The expected strings are written out by hand.

describe("formatConsultationTime", () => {
  it("shows the Melbourne date and time with the zone label, in summer", () => {
    const text = formatConsultationTime("2026-11-26T23:00:00Z"); // 10:00 AEDT on Friday 27 Nov
    expect(text).toMatch(/Fri/);
    expect(text).toMatch(/27 Nov 2026/);
    expect(text).toMatch(/10:00\s?am/i);
    expect(text).toMatch(/AEDT$/);
  });

  it("uses AEST in winter", () => {
    const text = formatConsultationTime("2026-07-14T23:30:00Z"); // 9:30 AEST on Wednesday 15 Jul
    expect(text).toMatch(/15 Jul 2026/);
    expect(text).toMatch(/9:30\s?am/i);
    expect(text).toMatch(/AEST$/);
  });

  it("is the Melbourne day, not the UTC day, when they differ", () => {
    expect(formatConsultationTime("2026-11-26T22:00:00Z")).toMatch(/27 Nov/);
  });

  it("rejects an invalid instant", () => {
    expect(() => formatConsultationTime("nope")).toThrow(RangeError);
  });
});

describe("calendarParts", () => {
  it("gives the weekday, day and month of the Melbourne day", () => {
    expect(calendarParts("2026-11-26T22:00:00Z")).toEqual({ weekday: "Fri", day: "27", month: "Nov" });
  });
});

describe("relativeDay", () => {
  const now = new Date("2026-11-26T23:30:00Z"); // 10:30 AEDT on Friday 27 Nov

  it("counts Melbourne calendar days", () => {
    expect(relativeDay("2026-11-27T05:00:00Z", now)).toBe("Today"); // 16:00 the same day
    expect(relativeDay("2026-11-27T22:00:00Z", now)).toBe("Tomorrow"); // 9:00 AEDT, 28 Nov
    expect(relativeDay("2026-12-01T00:00:00Z", now)).toBe("In 4 days");
  });

  it("is a Melbourne day even where the UTC date is still the day before", () => {
    // 00:30 AEDT on 28 Nov is 13:30Z on 27 Nov: tomorrow in Melbourne.
    expect(relativeDay("2026-11-27T13:30:00Z", now)).toBe("Tomorrow");
  });

  it("is null for a past day, and for more than two weeks out", () => {
    expect(relativeDay("2026-11-25T22:00:00Z", now)).toBeNull();
    expect(relativeDay("2026-12-11T22:00:00Z", now)).toBeNull();
  });
});
