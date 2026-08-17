"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/react";
import {
  Bold,
  Italic,
  Heading2,
  List,
  ListOrdered,
  Code,
  Paperclip,
  Table2,
  Rows3,
  Columns3,
  Trash2,
  Quote,
  Minus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getPortalRoot } from "@/lib/portal-root";

export type EditorContextMenuState = {
  x: number;
  y: number;
} | null;

type Props = {
  editor: Editor;
  menu: EditorContextMenuState;
  onClose: () => void;
  onAttachFile: () => void;
};

type MenuItem = {
  id: string;
  label: string;
  icon: ReactNode;
  active?: boolean;
  disabled?: boolean;
  destructive?: boolean;
  onSelect: () => void;
};

const VIEWPORT_MARGIN = 8;

/** Above expanded description overlay (z-10000) and insert-table panel */
const CONTEXT_MENU_Z = 10120;

function clampPosition(
  anchor: { x: number; y: number },
  size: { width: number; height: number },
) {
  let left = anchor.x;
  if (left + size.width > window.innerWidth - VIEWPORT_MARGIN) {
    left = window.innerWidth - size.width - VIEWPORT_MARGIN;
  }
  left = Math.max(VIEWPORT_MARGIN, left);

  let top = anchor.y;
  if (top + size.height > window.innerHeight - VIEWPORT_MARGIN) {
    top = anchor.y - size.height;
  }
  top = Math.max(VIEWPORT_MARGIN, top);

  return { left, top };
}

function MenuIconButton({
  item,
  onSelect,
}: {
  item: MenuItem;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      title={item.label}
      aria-label={item.label}
      disabled={item.disabled}
      onClick={onSelect}
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-md transition-colors",
        item.active
          ? "bg-pen-blue-tint text-pen-id"
          : item.destructive
            ? "text-destructive hover:bg-destructive/10"
            : "text-pen-muted hover:bg-pen-surface hover:text-pen-foreground",
        item.disabled && "cursor-not-allowed opacity-40",
      )}
    >
      {item.icon}
    </button>
  );
}

function MenuDivider() {
  return <div className="mx-0.5 h-5 w-px shrink-0 bg-pen-card-border" />;
}

export function EditorContextMenu({
  editor,
  menu,
  onClose,
  onAttachFile,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ left: number; top: number } | null>(
    null,
  );

  const reposition = useCallback(() => {
    if (!menu || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setCoords(
      clampPosition(menu, { width: rect.width, height: rect.height }),
    );
  }, [menu]);

  useLayoutEffect(() => {
    if (!menu) {
      setCoords(null);
      return;
    }
    reposition();
  }, [menu, reposition]);

  useEffect(() => {
    if (!menu) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function onPointerDown(e: MouseEvent) {
      if (e.button === 2) return;
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onScroll() {
      onClose();
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", reposition);
    };
  }, [menu, onClose, reposition]);

  if (!menu) return null;

  const inTable = editor.isActive("table");

  const run = (fn: () => void) => {
    fn();
    onClose();
  };

  const textItems: MenuItem[] = [
    {
      id: "bold",
      label: "Bold",
      icon: <Bold className="size-4" strokeWidth={2} />,
      active: editor.isActive("bold"),
      onSelect: () => run(() => editor.chain().focus().toggleBold().run()),
    },
    {
      id: "italic",
      label: "Italic",
      icon: <Italic className="size-4" strokeWidth={2} />,
      active: editor.isActive("italic"),
      onSelect: () => run(() => editor.chain().focus().toggleItalic().run()),
    },
    {
      id: "heading",
      label: "Heading",
      icon: <Heading2 className="size-4" strokeWidth={2} />,
      active: editor.isActive("heading", { level: 2 }),
      onSelect: () =>
        run(() => editor.chain().focus().toggleHeading({ level: 2 }).run()),
    },
    {
      id: "bullet",
      label: "Bullet list",
      icon: <List className="size-4" strokeWidth={2} />,
      active: editor.isActive("bulletList"),
      onSelect: () => run(() => editor.chain().focus().toggleBulletList().run()),
    },
    {
      id: "ordered",
      label: "Numbered list",
      icon: <ListOrdered className="size-4" strokeWidth={2} />,
      active: editor.isActive("orderedList"),
      onSelect: () =>
        run(() => editor.chain().focus().toggleOrderedList().run()),
    },
    {
      id: "code",
      label: "Inline code",
      icon: <Code className="size-4" strokeWidth={2} />,
      active: editor.isActive("code"),
      onSelect: () => run(() => editor.chain().focus().toggleCode().run()),
    },
    {
      id: "quote",
      label: "Quote",
      icon: <Quote className="size-4" strokeWidth={2} />,
      active: editor.isActive("blockquote"),
      onSelect: () =>
        run(() => editor.chain().focus().toggleBlockquote().run()),
    },
    {
      id: "hr",
      label: "Divider",
      icon: <Minus className="size-4" strokeWidth={2} />,
      onSelect: () => run(() => editor.chain().focus().setHorizontalRule().run()),
    },
  ];

  const tableItems: MenuItem[] = inTable
    ? [
        {
          id: "row-above",
          label: "Row above",
          icon: <Rows3 className="size-4" strokeWidth={2} />,
          onSelect: () =>
            run(() => editor.chain().focus().addRowBefore().run()),
        },
        {
          id: "row-below",
          label: "Row below",
          icon: <Rows3 className="size-4 rotate-180" strokeWidth={2} />,
          onSelect: () =>
            run(() => editor.chain().focus().addRowAfter().run()),
        },
        {
          id: "col-left",
          label: "Column left",
          icon: <Columns3 className="size-4" strokeWidth={2} />,
          onSelect: () =>
            run(() => editor.chain().focus().addColumnBefore().run()),
        },
        {
          id: "col-right",
          label: "Column right",
          icon: <Columns3 className="size-4 rotate-180" strokeWidth={2} />,
          onSelect: () =>
            run(() => editor.chain().focus().addColumnAfter().run()),
        },
        {
          id: "delete-row",
          label: "Delete row",
          icon: <Rows3 className="size-4" strokeWidth={2} />,
          destructive: true,
          disabled: !editor.can().deleteRow(),
          onSelect: () => run(() => editor.chain().focus().deleteRow().run()),
        },
        {
          id: "delete-col",
          label: "Delete column",
          icon: <Columns3 className="size-4" strokeWidth={2} />,
          destructive: true,
          disabled: !editor.can().deleteColumn(),
          onSelect: () => run(() => editor.chain().focus().deleteColumn().run()),
        },
        {
          id: "delete-table",
          label: "Delete table",
          icon: <Trash2 className="size-4" strokeWidth={2} />,
          destructive: true,
          onSelect: () =>
            run(() => editor.chain().focus().deleteTable().run()),
        },
      ]
    : [
        {
          id: "table-2",
          label: "Table 2×2",
          icon: <Table2 className="size-4" strokeWidth={2} />,
          onSelect: () =>
            run(() =>
              editor
                .chain()
                .focus()
                .insertTable({ rows: 2, cols: 2, withHeaderRow: true })
                .run(),
            ),
        },
        {
          id: "table-3",
          label: "Table 3×3",
          icon: <Table2 className="size-4" strokeWidth={2} />,
          onSelect: () =>
            run(() =>
              editor
                .chain()
                .focus()
                .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                .run(),
            ),
        },
        {
          id: "table-4",
          label: "Table 4×4",
          icon: <Table2 className="size-4" strokeWidth={2} />,
          onSelect: () =>
            run(() =>
              editor
                .chain()
                .focus()
                .insertTable({ rows: 4, cols: 4, withHeaderRow: true })
                .run(),
            ),
        },
      ];

  const attachItem: MenuItem = {
    id: "attach",
    label: "Attach file",
    icon: <Paperclip className="size-4" strokeWidth={2} />,
    onSelect: () => run(onAttachFile),
  };

  const sections = [
    textItems,
    tableItems,
    [attachItem],
  ];

  const position = coords ?? { left: menu.x, top: menu.y };

  const menuNode = (
    <div
      ref={ref}
      className="fixed flex max-w-[calc(100vw-16px)] items-center gap-0.5 overflow-x-auto rounded-lg border border-pen-card-border bg-pen-card p-1 shadow-lg"
      style={{ left: position.left, top: position.top, zIndex: CONTEXT_MENU_Z }}
      role="menu"
      onContextMenu={(e) => e.preventDefault()}
    >
      {sections.map((items, sectionIdx) => (
        <div key={sectionIdx} className="flex items-center gap-0.5">
          {sectionIdx > 0 && <MenuDivider />}
          {items.map((item) => (
            <MenuIconButton
              key={item.id}
              item={item}
              onSelect={item.onSelect}
            />
          ))}
        </div>
      ))}
    </div>
  );

  const portalRoot = getPortalRoot();
  return portalRoot ? createPortal(menuNode, portalRoot) : null;
}
