"use client";

import { type ReactNode } from "react";
import { DndProvider } from "react-dnd";
import { MultiBackend, MouseTransition, TouchTransition } from "react-dnd-multi-backend";
import { HTML5Backend } from "react-dnd-html5-backend";
import { TouchBackend } from "react-dnd-touch-backend";

/** HTML5 on desktop; touch backend on phones/tablets with a short hold before drag. */
const BOARD_DND_OPTIONS = {
  backends: [
    {
      id: "html5",
      backend: HTML5Backend,
      transition: MouseTransition,
    },
    {
      id: "touch",
      backend: TouchBackend,
      options: {
        enableMouseEvents: false,
        delayTouchStart: 150,
        touchSlop: 8,
      },
      preview: true,
      transition: TouchTransition,
    },
  ],
};

export function BoardDndProvider({ children }: { children: ReactNode }) {
  return (
    <DndProvider backend={MultiBackend} options={BOARD_DND_OPTIONS}>
      {children}
    </DndProvider>
  );
}
