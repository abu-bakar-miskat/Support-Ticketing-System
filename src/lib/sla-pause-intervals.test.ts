import { describe, it, expect } from "vitest";
import { waitingForCustomerPauseIntervals } from "./sla-pause-intervals";

describe("waitingForCustomerPauseIntervals", () => {
  it("returns empty when there are no public messages", () => {
    expect(waitingForCustomerPauseIntervals([], new Date("2026-08-17T12:00:00.000Z"))).toEqual([]);
  });

  it("pauses from each outbound until the next inbound (or until)", () => {
    const until = new Date("2026-08-17T16:00:00.000Z");
    const intervals = waitingForCustomerPauseIntervals(
      [
        { direction: "inbound", createdAt: "2026-08-17T09:00:00.000Z" },
        { direction: "outbound", createdAt: "2026-08-17T10:00:00.000Z" },
        { direction: "inbound", createdAt: "2026-08-17T12:00:00.000Z" },
        { direction: "outbound", createdAt: "2026-08-17T13:00:00.000Z" },
      ],
      until,
    );
    expect(intervals).toEqual([
      {
        from: new Date("2026-08-17T10:00:00.000Z"),
        to: new Date("2026-08-17T12:00:00.000Z"),
      },
      {
        from: new Date("2026-08-17T13:00:00.000Z"),
        to: until,
      },
    ]);
  });

  it("ignores system messages", () => {
    const until = new Date("2026-08-17T14:00:00.000Z");
    const intervals = waitingForCustomerPauseIntervals(
      [
        { direction: "outbound", status: "system", createdAt: "2026-08-17T10:00:00.000Z" },
        { direction: "outbound", createdAt: "2026-08-17T11:00:00.000Z" },
      ],
      until,
    );
    expect(intervals).toEqual([
      { from: new Date("2026-08-17T11:00:00.000Z"), to: until },
    ]);
  });
});


it("a quarantined inbound message does not end the customer-wait pause", () => {
  const until = new Date("2026-10-12T11:00:00Z")
  expect(waitingForCustomerPauseIntervals([
    { direction: "outbound", status: "trusted", createdAt: "2026-10-12T09:00:00Z" },
    { direction: "inbound", status: "quarantined", createdAt: "2026-10-12T10:00:00Z" },
  ], until)).toEqual([{ from: new Date("2026-10-12T09:00:00Z"), to: until }])
})
