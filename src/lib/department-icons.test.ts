import { describe, expect, it } from "vitest";
import { Code2, LayoutGrid, Server, Sparkles } from "lucide-react";
import { getDepartmentIcon } from "./department-icons";

describe("getDepartmentIcon", () => {
  it("maps common department names to distinct icons", () => {
    expect(getDepartmentIcon("Web Development")).toBe(Code2);
    expect(getDepartmentIcon("Software Development")).toBe(Server);
    expect(getDepartmentIcon("General Department")).toBe(LayoutGrid);
    expect(getDepartmentIcon("Innovation Hub", "dept-1", true)).toBe(Sparkles);
  });

  it("returns a stable icon for the same department id", () => {
    const first = getDepartmentIcon("Custom Ops", "dept-stable");
    const second = getDepartmentIcon("Custom Ops", "dept-stable");
    expect(first).toBe(second);
  });
});
