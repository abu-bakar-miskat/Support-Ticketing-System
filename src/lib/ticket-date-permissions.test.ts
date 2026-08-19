import { describe, expect, it } from "vitest";
import {
  canEditTicket,
  canEditTicketDescription,
  isLeadOnTicketSubDepartment,
} from "@/lib/ticket-date-permissions";

describe("isLeadOnTicketTeam", () => {
  it("returns true when membership role is lead on the ticket team", () => {
    const profile = {
      id: "user-1",
      role: "staff",
      memberships: [{ subDepartmentId: "team-a", role: "sub_manager" }],
    };
    expect(isLeadOnTicketSubDepartment(profile, "team-a")).toBe(true);
    expect(isLeadOnTicketSubDepartment(profile, "team-b")).toBe(false);
  });

  it("returns true when profile role is lead and user belongs to the team", () => {
    const profile = {
      id: "user-1",
      role: "sub_manager",
      subDepartmentIds: ["team-a", "team-b"],
      memberships: [],
    };
    expect(isLeadOnTicketSubDepartment(profile, "team-a")).toBe(true);
    expect(isLeadOnTicketSubDepartment(profile, "team-c")).toBe(false);
  });
});

describe("canEditTicket", () => {
  const otherTicket = {
    assigneeId: "other-user",
    creatorId: "creator-user",
    coAssigneeIds: [] as string[],
    subDepartmentId: "team-a",
  };

  it("allows team leads to edit tickets on their team without being assignee or creator", () => {
    const lead = {
      id: "lead-user",
      role: "staff",
      memberships: [{ subDepartmentId: "team-a", role: "sub_manager" }],
    };
    expect(canEditTicket(lead, otherTicket)).toBe(true);
  });

  it("denies staff who are not assignee, creator, co-assignee, or team lead", () => {
    const staff = {
      id: "staff-user",
      role: "staff",
      memberships: [{ subDepartmentId: "team-a", role: "member" }],
    };
    expect(canEditTicket(staff, otherTicket)).toBe(false);
  });

  it("still allows creators and assignees", () => {
    const creator = { id: "creator-user", role: "staff" };
    const assignee = { id: "other-user", role: "staff" };
    expect(canEditTicket(creator, otherTicket)).toBe(true);
    expect(canEditTicket(assignee, otherTicket)).toBe(true);
  });
});

describe("canEditTicketDescription", () => {
  const ticket = {
    assigneeId: "assignee-user",
    creatorId: "creator-user",
    coAssigneeIds: ["co-user"],
    subDepartmentId: "team-a",
    departmentId: "dept-a",
  };

  it("allows creator, assignee, and co-assignee", () => {
    expect(canEditTicketDescription({ id: "creator-user", role: "staff" }, ticket)).toBe(true);
    expect(canEditTicketDescription({ id: "assignee-user", role: "staff" }, ticket)).toBe(true);
    expect(canEditTicketDescription({ id: "co-user", role: "staff" }, ticket)).toBe(true);
  });

  it("allows department managers of the ticket department", () => {
    expect(
      canEditTicketDescription(
        { id: "mgr-user", role: "staff", managedDepartmentIds: ["dept-a"] },
        ticket,
      ),
    ).toBe(true);
    expect(
      canEditTicketDescription(
        { id: "mgr-user", role: "staff", managedDepartmentIds: ["dept-b"] },
        ticket,
      ),
    ).toBe(false);
  });

  it("denies team leads, admins, and unrelated staff", () => {
    const lead = {
      id: "lead-user",
      role: "staff",
      memberships: [{ subDepartmentId: "team-a", role: "sub_manager" }],
    };
    expect(canEditTicketDescription(lead, ticket)).toBe(false);
    expect(canEditTicketDescription({ id: "admin-user", role: "admin" }, ticket)).toBe(false);
    expect(canEditTicketDescription({ id: "random-user", role: "staff" }, ticket)).toBe(false);
  });
});
