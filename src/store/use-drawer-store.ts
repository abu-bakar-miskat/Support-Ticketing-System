import { create } from "zustand";

interface DrawerStore {
  stack: string[]; // [parentId] or [parentId, subId]
  open: (id: string) => void;
  pushSub: (subId: string) => void;
  replaceSub: (subId: string) => void;
  pop: () => void;
  close: () => void;
}

export const useDrawerStore = create<DrawerStore>((set) => ({
  stack: [],
  open: (id) => set({ stack: [id] }),
  pushSub: (subId) =>
    set((s) => ({ stack: s.stack.length > 0 ? [s.stack[0], subId] : [subId] })),
  replaceSub: (subId) =>
    set((s) => ({ stack: s.stack.length >= 2 ? [s.stack[0], subId] : s.stack })),
  pop: () => set((s) => ({ stack: s.stack.slice(0, 1) })),
  close: () => set({ stack: [] }),
}));
