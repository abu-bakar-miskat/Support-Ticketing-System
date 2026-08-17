import { create } from "zustand";

// Lightweight pub/sub so NotificationsRealtime (layout) can tell
// InboxPage about new notifications without re-using the same Supabase channel.
type NotifListener = (id: string, type: string) => void;
const listeners = new Set<NotifListener>();

export const notifEvents = {
  subscribe(fn: NotifListener): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },
  emit(id: string, type: string) {
    listeners.forEach((fn) => fn(id, type));
  },
};

interface NotificationStore {
  unreadCount: number;
  initialized: boolean;
  /** Called once from the layout with the server-rendered count */
  init: (count: number) => void;
  increment: () => void;
  decrement: (by?: number) => void;
  reset: () => void;
}

export const useNotificationStore = create<NotificationStore>((set) => ({
  unreadCount: 0,
  initialized: false,
  init: (count) => set({ unreadCount: count, initialized: true }),
  increment: () => set((s) => ({ unreadCount: s.unreadCount + 1 })),
  decrement: (by = 1) => set((s) => ({ unreadCount: Math.max(0, s.unreadCount - by) })),
  reset: () => set({ unreadCount: 0 }),
}));
