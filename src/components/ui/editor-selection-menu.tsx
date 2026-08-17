"use client";

import {
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
  Quote,
  Strikethrough,
  Baseline,
  Ban,
  Heading1,
  Heading3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getPortalRoot } from "@/lib/portal-root";
import { TEXT_COLORS } from "./text-color-popover";

const VIEWPORT_MARGIN = 8;

/** Above expanded description overlay; below context menu */
const SELECTION_MENU_Z = 10115;

type SelectionBounds = {
  top: number;
  bottom: number;
  left: number;
  width: number;
};

function getSelectionBounds(editor: Editor): SelectionBounds | null {
  const { selection } = editor.state;
  if (selection.empty) return null;

  const { from, to } = selection;
  if (from === to) return null;

  const start = editor.view.coordsAtPos(from);
  const end = editor.view.coordsAtPos(to);

  const left = Math.min(start.left, end.left);
  const right = Math.max(start.right, end.right);

  return {
    top: Math.min(start.top, end.top),
    bottom: Math.max(start.bottom, end.bottom),
    left,
    width: Math.max(right - left, 1),
  };
}

type FormatItem = {
  id: string;
  label: string;
  icon: ReactNode;
  active?: boolean;
  onSelect: () => void;
};

function FormatButton({
  item,
}: {
  item: FormatItem;
}) {
  return (
    <button
      type="button"
      title={item.label}
      aria-label={item.label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={item.onSelect}
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-md transition-colors",
        item.active
          ? "bg-pen-blue-tint text-pen-id"
          : "text-pen-muted hover:bg-pen-surface hover:text-pen-foreground",
      )}
    >
      {item.icon}
    </button>
  );
}

function MenuDivider() {
  return <div className="mx-0.5 h-5 w-px shrink-0 bg-pen-card-border" />;
}

export function EditorSelectionMenu({
  editor,
  hidden = false,
}: {
  editor: Editor;
  hidden?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState<SelectionBounds | null>(null);
  const [showColors, setShowColors] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(
    null,
  );

  useEffect(() => {
    const update = () => {
      if (hidden || !editor.isEditable || !editor.isFocused) {
        setBounds(null);
        return;
      }
      setBounds(getSelectionBounds(editor));
    };

    const onBlur = () => setBounds(null);

    update();
    editor.on("selectionUpdate", update);
    editor.on("transaction", update);
    editor.on("focus", update);
    editor.on("blur", onBlur);

    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);

    return () => {
      editor.off("selectionUpdate", update);
      editor.off("transaction", update);
      editor.off("focus", update);
      editor.off("blur", onBlur);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [editor, hidden]);

  // Collapse the color row whenever the menu hides
  useEffect(() => {
    if (!bounds) setShowColors(false);
  }, [bounds]);

  useLayoutEffect(() => {
    if (!bounds || !ref.current) {
      setPosition(null);
      return;
    }

    const menu = ref.current.getBoundingClientRect();
    const centerX = bounds.left + bounds.width / 2;
    let left = centerX - menu.width / 2;
    let top = bounds.top - menu.height - 8;

    left = Math.max(
      VIEWPORT_MARGIN,
      Math.min(left, window.innerWidth - menu.width - VIEWPORT_MARGIN),
    );

    if (top < VIEWPORT_MARGIN) {
      top = bounds.bottom + 8;
    }

    setPosition({ left, top });
  }, [bounds, editor.state.selection]);

  const run = (fn: () => void) => {
    fn();
  };

  const textItems: FormatItem[] = [
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
      id: "strike",
      label: "Strikethrough",
      icon: <Strikethrough className="size-4" strokeWidth={2} />,
      active: editor.isActive("strike"),
      onSelect: () => run(() => editor.chain().focus().toggleStrike().run()),
    },
    {
      id: "heading1",
      label: "Heading 1",
      icon: <Heading1 className="size-4" strokeWidth={2} />,
      active: editor.isActive("heading", { level: 1 }),
      onSelect: () =>
        run(() => editor.chain().focus().toggleHeading({ level: 1 }).run()),
    },
    {
      id: "heading2",
      label: "Heading 2",
      icon: <Heading2 className="size-4" strokeWidth={2} />,
      active: editor.isActive("heading", { level: 2 }),
      onSelect: () =>
        run(() => editor.chain().focus().toggleHeading({ level: 2 }).run()),
    },
    {
      id: "heading3",
      label: "Heading 3",
      icon: <Heading3 className="size-4" strokeWidth={2} />,
      active: editor.isActive("heading", { level: 3 }),
      onSelect: () =>
        run(() => editor.chain().focus().toggleHeading({ level: 3 }).run()),
    },
    {
      id: "bullet",
      label: "Bullet list",
      icon: <List className="size-4" strokeWidth={2} />,
      active: editor.isActive("bulletList"),
      onSelect: () =>
        run(() => editor.chain().focus().toggleBulletList().run()),
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
  ];

  if (!bounds) return null;

  const portalRoot = getPortalRoot();
  if (!portalRoot) return null;

  const menuNode = (
    <div
      ref={ref}
      role="toolbar"
      aria-label="Text formatting"
      className="fixed flex max-w-[calc(100vw-16px)] items-center gap-0.5 overflow-x-auto rounded-lg border border-pen-card-border bg-pen-card p-1 shadow-lg"
      style={{
        left: position?.left ?? -9999,
        top: position?.top ?? -9999,
        zIndex: SELECTION_MENU_Z,
        visibility: position ? "visible" : "hidden",
      }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {textItems.slice(0, 3).map((item) => (
        <FormatButton key={item.id} item={item} />
      ))}
      <MenuDivider />
      {textItems.slice(3).map((item) => (
        <FormatButton key={item.id} item={item} />
      ))}
      <MenuDivider />
      <FormatButton
        item={{
          id: "text-color",
          label: "Text color",
          icon: <Baseline className="size-4" strokeWidth={2} />,
          active:
            showColors ||
            TEXT_COLORS.some((c) =>
              editor.isActive("textStyle", { color: c.value }),
            ),
          onSelect: () => setShowColors((v) => !v),
        }}
      />
      {showColors && (
        <>
          {TEXT_COLORS.map((c) => (
            <button
              key={c.name}
              type="button"
              title={c.name}
              aria-label={`Text color ${c.name}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor.chain().focus().setColor(c.value).run()}
              className={cn(
                "flex size-5 shrink-0 items-center justify-center rounded-md border font-sans text-[12px] font-bold transition-transform hover:scale-110",
                editor.isActive("textStyle", { color: c.value })
                  ? "border-pen-id ring-1 ring-pen-id"
                  : "border-pen-card-border",
              )}
              style={{ color: c.value }}
            >
              A
            </button>
          ))}
          <button
            type="button"
            title="Default color"
            aria-label="Default color"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().unsetColor().run()}
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-pen-muted transition-colors hover:bg-pen-surface hover:text-pen-foreground"
          >
            <Ban className="size-4" strokeWidth={2} />
          </button>
        </>
      )}
    </div>
  );

  return createPortal(menuNode, portalRoot);
}
