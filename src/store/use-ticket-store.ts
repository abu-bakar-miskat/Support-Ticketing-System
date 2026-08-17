'use client'

import { create } from 'zustand'
import type { TicketPriority, TicketType } from '@/generated/prisma/enums'

export type TicketRow = {
  id: string
  ticketNumber: number
  title: string
  type: TicketType
  priority: TicketPriority
  status: string
  assigneeId: string | null
  creatorId: string
  projectId: string
  teamId: string
  cycleTime: number | null
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
}

type TicketFilters = {
  status: string | null
  priority: TicketPriority | null
  type: TicketType | null
  assigneeId: string | null
  projectId: string | null
}

type TicketState = {
  tickets: TicketRow[]
  selectedTicketId: string | null
  filters: TicketFilters
  setTickets: (tickets: TicketRow[]) => void
  addTicket: (ticket: TicketRow) => void
  updateTicket: (id: string, patch: Partial<TicketRow>) => void
  removeTicket: (id: string) => void
  selectTicket: (id: string | null) => void
  setFilter: <K extends keyof TicketFilters>(key: K, value: TicketFilters[K]) => void
  clearFilters: () => void
}

const DEFAULT_FILTERS: TicketFilters = {
  status: null,
  priority: null,
  type: null,
  assigneeId: null,
  projectId: null,
}

export const useTicketStore = create<TicketState>((set) => ({
  tickets: [],
  selectedTicketId: null,
  filters: DEFAULT_FILTERS,

  setTickets: (tickets) => set({ tickets }),

  addTicket: (ticket) =>
    set((state) => ({ tickets: [ticket, ...state.tickets] })),

  updateTicket: (id, patch) =>
    set((state) => ({
      tickets: state.tickets.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    })),

  removeTicket: (id) =>
    set((state) => ({ tickets: state.tickets.filter((t) => t.id !== id) })),

  selectTicket: (id) => set({ selectedTicketId: id }),

  setFilter: (key, value) =>
    set((state) => ({ filters: { ...state.filters, [key]: value } })),

  clearFilters: () => set({ filters: DEFAULT_FILTERS }),
}))
