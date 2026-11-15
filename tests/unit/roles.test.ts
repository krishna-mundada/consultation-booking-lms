import { describe, expect, it } from "vitest";
import { ROLE, can, parseRole } from "@/lib/domain/roles";

// The role model: what each role may do is defined in one table (AC-12, ADR 0001, ADR 0007).

describe("can", () => {
  it("lets a student write their own consultations and nothing wider", () => {
    expect(can(ROLE.student, "write")).toBe(true);
    expect(can(ROLE.student, "readAll")).toBe(false);
    expect(can(ROLE.student, "manageTutors")).toBe(false);
  });

  it("lets an admin read everything and manage tutors, but never write consultations", () => {
    expect(can(ROLE.admin, "readAll")).toBe(true);
    expect(can(ROLE.admin, "manageTutors")).toBe(true);
    expect(can(ROLE.admin, "write")).toBe(false);
  });

  it("gives a tutor no capability: their sessions follow from being the tutor on them", () => {
    expect(can(ROLE.tutor, "write")).toBe(false);
    expect(can(ROLE.tutor, "readAll")).toBe(false);
    expect(can(ROLE.tutor, "manageTutors")).toBe(false);
  });

  it.each([null, undefined])("gives %s no capabilities at all", (role) => {
    expect(can(role, "write")).toBe(false);
    expect(can(role, "readAll")).toBe(false);
    expect(can(role, "manageTutors")).toBe(false);
  });
});

describe("parseRole", () => {
  it.each(["student", "tutor", "admin"])("accepts %s", (value) => {
    expect(parseRole(value)).toBe(value);
  });

  it.each([null, undefined, "", "super_admin", "ADMIN", 7])("treats %s as no role", (value) => {
    expect(parseRole(value)).toBeNull();
  });
});
