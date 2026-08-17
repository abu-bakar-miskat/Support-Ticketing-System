import { describe, it, expect, vi } from "vitest"
import { createTicketsSubscription, createTicketDetailSubscription, createNotificationsSubscription } from "./realtime"
import type { SupabaseLike } from "./realtime"

function makeMockSupabase() {
  const channel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
  }
  const removeChannel = vi.fn()
  const supabase: SupabaseLike = {
    channel: vi.fn().mockReturnValue(channel),
    removeChannel,
  }
  return { supabase, channel, removeChannel }
}

describe("createTicketsSubscription", () => {
  it("subscribes to Ticket and TicketAssignee tables with wildcard events", () => {
    const { supabase, channel } = makeMockSupabase()
    const onUpdate = vi.fn()

    createTicketsSubscription(supabase, onUpdate)

    expect(supabase.channel).toHaveBeenCalledWith(expect.stringMatching(/^board:tickets:\d+:0$/))
    expect(channel.on).toHaveBeenCalledWith(
      "postgres_changes",
      { event: "*", schema: "public", table: "Ticket" },
      onUpdate,
    )
    expect(channel.on).toHaveBeenCalledWith(
      "postgres_changes",
      { event: "*", schema: "public", table: "TicketAssignee" },
      onUpdate,
    )
    expect(channel.subscribe).toHaveBeenCalled()
  })

  it("calls removeChannel when cleanup function is invoked", () => {
    const { supabase, channel, removeChannel } = makeMockSupabase()
    const cleanup = createTicketsSubscription(supabase, vi.fn())
    cleanup()
    expect(removeChannel).toHaveBeenCalledWith(channel)
  })

  it("invokes the onUpdate callback when either table event fires", () => {
    const { supabase, channel } = makeMockSupabase()
    const onUpdate = vi.fn()
    createTicketsSubscription(supabase, onUpdate)
    const ticketCb = vi.mocked(channel.on).mock.calls[0][2] as () => void
    const assigneeCb = vi.mocked(channel.on).mock.calls[1][2] as () => void
    ticketCb()
    assigneeCb()
    expect(onUpdate).toHaveBeenCalledTimes(2)
  })
})

describe("createTicketDetailSubscription", () => {
  it("registers Ticket UPDATE, Comment INSERT, and sub-ticket listeners on one channel", () => {
    const { supabase, channel } = makeMockSupabase()

    createTicketDetailSubscription(supabase, "ticket-abc", {
      onStatusChange: vi.fn(),
      onCommentInsert: vi.fn(),
    })

    expect(supabase.channel).toHaveBeenCalledWith(expect.stringMatching(/^ticket-detail:ticket-abc:\d+:0$/))
    expect(channel.on).toHaveBeenCalledTimes(4)

    const calls = vi.mocked(channel.on).mock.calls.map((c) => c[1])
    expect(calls[0]).toMatchObject({ event: "UPDATE", table: "Ticket", filter: "id=eq.ticket-abc" })
    expect(calls[1]).toMatchObject({ event: "INSERT", table: "Comment", filter: "ticketId=eq.ticket-abc" })
    expect(calls[2]).toMatchObject({ event: "INSERT", table: "TicketMessage", filter: "ticketId=eq.ticket-abc" })
    // Realtime rejects filters on non-PK columns for DELETE-inclusive subscriptions
    // ("invalid column for filter parentId"), so the sub-ticket listener must be
    // unfiltered and match parentId client-side.
    expect(calls[3]).toMatchObject({ event: "*", table: "Ticket" })
    expect(calls[3]).not.toHaveProperty("filter")
  })

  it("fires onTicketUpdate only for sub-ticket events matching parentId", () => {
    const { supabase, channel } = makeMockSupabase()
    const onTicketUpdate = vi.fn()
    createTicketDetailSubscription(supabase, "ticket-abc", { onTicketUpdate })
    const cb = vi.mocked(channel.on).mock.calls[3][2] as (p: unknown) => void

    cb({ eventType: "INSERT", new: { id: "child-1", parentId: "ticket-abc" } })
    expect(onTicketUpdate).toHaveBeenCalledTimes(1)

    cb({ eventType: "UPDATE", new: { id: "other", parentId: "ticket-xyz" } })
    expect(onTicketUpdate).toHaveBeenCalledTimes(1)

    cb({ eventType: "UPDATE", new: { id: "ticket-abc", parentId: null } })
    expect(onTicketUpdate).toHaveBeenCalledTimes(1)
  })

  it("prefers onSubTicketChange over onTicketUpdate for child events", () => {
    const { supabase, channel } = makeMockSupabase()
    const onTicketUpdate = vi.fn()
    const onSubTicketChange = vi.fn()
    createTicketDetailSubscription(supabase, "ticket-abc", {
      onTicketUpdate,
      onSubTicketChange,
    })
    const cb = vi.mocked(channel.on).mock.calls[3][2] as (p: unknown) => void

    cb({ eventType: "INSERT", new: { id: "child-1", parentId: "ticket-abc" } })
    expect(onSubTicketChange).toHaveBeenCalledTimes(1)
    expect(onTicketUpdate).not.toHaveBeenCalled()
  })

  it("fires onTicketUpdate on any Ticket DELETE (payload lacks parentId)", () => {
    const { supabase, channel } = makeMockSupabase()
    const onTicketUpdate = vi.fn()
    createTicketDetailSubscription(supabase, "ticket-abc", { onTicketUpdate })
    const cb = vi.mocked(channel.on).mock.calls[3][2] as (p: unknown) => void

    cb({ eventType: "DELETE", old: { id: "child-1" } })
    expect(onTicketUpdate).toHaveBeenCalledTimes(1)
  })

  it("calls removeChannel on cleanup", () => {
    const { supabase, channel, removeChannel } = makeMockSupabase()
    const cleanup = createTicketDetailSubscription(supabase, "ticket-abc", {})
    cleanup()
    expect(removeChannel).toHaveBeenCalledWith(channel)
  })

  it("fires onStatusChange with new status from UPDATE payload", () => {
    const { supabase, channel } = makeMockSupabase()
    const onStatusChange = vi.fn()
    createTicketDetailSubscription(supabase, "ticket-abc", { onStatusChange })
    const cb = vi.mocked(channel.on).mock.calls[0][2] as (p: unknown) => void
    cb({ old: { status: "Backlog" }, new: { status: "In Progress" } })
    expect(onStatusChange).toHaveBeenCalledWith("In Progress")
  })

  it("fires onCommentInsert with id and parentId from INSERT payload", () => {
    const { supabase, channel } = makeMockSupabase()
    const onCommentInsert = vi.fn()
    createTicketDetailSubscription(supabase, "ticket-abc", { onCommentInsert })
    const cb = vi.mocked(channel.on).mock.calls[1][2] as (p: unknown) => void
    cb({ new: { id: "comment-1", parentId: null } })
    expect(onCommentInsert).toHaveBeenCalledWith("comment-1", null)
  })
})

describe("createNotificationsSubscription", () => {
  it("uses a unique channel name with suffix", () => {
    const { supabase } = makeMockSupabase()
    createNotificationsSubscription(supabase, "user-123", vi.fn(), "inbox")
    expect(supabase.channel).toHaveBeenCalledWith(expect.stringMatching(/^notifications:user-123:inbox:\d+:0$/))
  })

  it("defaults suffix to 'global'", () => {
    const { supabase } = makeMockSupabase()
    createNotificationsSubscription(supabase, "user-123", vi.fn())
    expect(supabase.channel).toHaveBeenCalledWith(expect.stringMatching(/^notifications:user-123:global:\d+:0$/))
  })

  it("calls removeChannel on cleanup", () => {
    const { supabase, channel, removeChannel } = makeMockSupabase()
    const cleanup = createNotificationsSubscription(supabase, "user-123", vi.fn())
    cleanup()
    expect(removeChannel).toHaveBeenCalledWith(channel)
  })
})
