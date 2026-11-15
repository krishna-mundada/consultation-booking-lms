import { describe, expect, it } from "vitest";
import {
  bookableDays,
  formatDayLabel,
  formatSlotTime,
  isOnSlotGrid,
  isSlotBookable,
  melbourneDate,
  melbourneInstant,
  slotsForDay,
  zoneAbbreviation,
} from "@/lib/domain/slots";

// Bookings live in one fixed zone, Australia/Melbourne, whatever the viewer's own zone is (ADR 0007,
// A11, A12). The expected values below are written out by hand, not computed with the code under test.

describe("melbourneInstant", () => {
  it("converts Melbourne wall-clock time to UTC, in summer (AEDT, +11)", () => {
    expect(melbourneInstant(2026, 11, 27, 9, 0)).toBe("2026-11-26T22:00:00.000Z");
  });

  it("converts in winter (AEST, +10)", () => {
    expect(melbourneInstant(2026, 7, 15, 9, 30)).toBe("2026-07-14T23:30:00.000Z");
  });

  it("handles the day the clocks change (first Sunday in April: 3:00 AEDT back to 2:00 AEST)", () => {
    // Saturday 4 April 2026 is still AEDT, Monday 6 April is AEST.
    expect(melbourneInstant(2026, 4, 4, 9, 0)).toBe("2026-04-03T22:00:00.000Z");
    expect(melbourneInstant(2026, 4, 6, 9, 0)).toBe("2026-04-05T23:00:00.000Z");
  });
});

describe("slotsForDay", () => {
  it("has sixteen half-hour starts, 9:00 to 16:30 Melbourne time", () => {
    const slots = slotsForDay("2026-11-27");
    expect(slots).toHaveLength(16);
    expect(slots[0]).toBe("2026-11-26T22:00:00.000Z");
    expect(slots[15]).toBe("2026-11-27T05:30:00.000Z"); // 16:30 AEDT
  });

  it("follows the daylight-saving change: the same wall-clock hours, a different UTC offset", () => {
    expect(slotsForDay("2026-07-15")[0]).toBe("2026-07-14T23:00:00.000Z");
  });

  it("does not depend on the machine's own zone", () => {
    // Vitest runs in Melbourne time, so this guards against a regression to viewer-local maths by
    // checking an instant that is a different calendar day in UTC.
    expect(melbourneDate(slotsForDay("2026-11-27")[0])).toBe("2026-11-27");
  });

  it.each(["2026-13-01", "2026-02-30", "27/11/2026", "", "2026-11-27T09:00"])("rejects %j", (bad) => {
    expect(() => slotsForDay(bad)).toThrow(RangeError);
  });
});

describe("melbourneDate and zoneAbbreviation", () => {
  it("names the Melbourne calendar day of an instant", () => {
    expect(melbourneDate("2026-11-26T22:00:00Z")).toBe("2026-11-27");
    expect(melbourneDate("2026-11-27T12:59:00Z")).toBe("2026-11-27"); // 23:59 AEDT
    expect(melbourneDate("2026-11-27T13:00:00Z")).toBe("2026-11-28"); // midnight AEDT
  });

  it("labels the zone AEDT in summer and AEST in winter", () => {
    expect(zoneAbbreviation("2026-11-27T00:00:00Z")).toBe("AEDT");
    expect(zoneAbbreviation("2026-07-15T00:00:00Z")).toBe("AEST");
  });
});

describe("formatting", () => {
  it("formats a slot time and a day in Melbourne time, whatever the viewer's zone", () => {
    expect(formatSlotTime("2026-11-26T22:00:00Z")).toBe("9:00 am");
    expect(formatSlotTime("2026-11-27T05:30:00Z")).toBe("4:30 pm");
    expect(formatDayLabel("2026-11-27")).toBe("Fri 27 Nov");
  });
});

describe("isOnSlotGrid", () => {
  it("accepts the half hour and nothing finer", () => {
    expect(isOnSlotGrid("2026-11-27T00:30:00Z")).toBe(true);
    expect(isOnSlotGrid("2026-11-27T00:15:00Z")).toBe(false);
    expect(isOnSlotGrid("2026-11-27T00:00:30Z")).toBe(false);
    expect(isOnSlotGrid("nope")).toBe(false);
  });
});

describe("isSlotBookable (A14: at least an hour ahead, at most 56 days)", () => {
  const now = new Date("2026-11-27T00:00:00Z"); // 11:00 AEDT, a Friday

  it("needs at least an hour's notice", () => {
    expect(isSlotBookable("2026-11-27T00:30:00Z", now)).toBe(false);
    expect(isSlotBookable("2026-11-27T00:59:00Z", now)).toBe(false);
    expect(isSlotBookable("2026-11-27T01:00:00Z", now)).toBe(true);
  });

  it("looks no further than 56 days ahead", () => {
    expect(isSlotBookable("2027-01-22T00:00:00Z", now)).toBe(true); // exactly 56 days
    expect(isSlotBookable("2027-01-22T00:30:00Z", now)).toBe(false);
  });
});

describe("bookableDays", () => {
  const now = new Date("2026-11-27T00:00:00Z"); // Friday 27 Nov, 11:00 AEDT

  it("lists weekdays only, from today, in order", () => {
    const days = bookableDays(now);
    expect(days[0]).toBe("2026-11-27");
    expect(days[1]).toBe("2026-11-30"); // the weekend is skipped
    expect(days).toEqual([...days].sort());
    for (const day of days) {
      const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
      expect(weekday === 0 || weekday === 6).toBe(false);
    }
  });

  it("stops at the last day that still has a bookable slot", () => {
    const days = bookableDays(now);
    expect(days.at(-1)).toBe("2027-01-22"); // 56 days on is a Friday, and 9:00-11:00 are within the window
  });

  it("leaves out today once no slot is left with an hour's notice", () => {
    // 16:00 AEDT on a Friday: the last slot, 16:30, is only half an hour away.
    expect(bookableDays(new Date("2026-11-27T05:00:00Z"))[0]).toBe("2026-11-30");
  });
});
