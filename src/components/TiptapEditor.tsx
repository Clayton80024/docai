"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/core";
import { useEditor, EditorContent } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Italic, List, ListOrdered, Quote, Sparkles, Scale, Flag, Brain, Loader2 } from "lucide-react";
import { transformSelectionWithAI, type TransformCommand } from "@/app/actions/transform-selection";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function plainToHtml(plain: string): string {
  if (!plain || !plain.trim()) return "<p></p>";
  const paragraphs = plain.split(/\n\n+/);
  return paragraphs
    .map((p) => "<p>" + escapeHtml(p).replace(/\n/g, "<br/>") + "</p>")
    .join("");
}

function htmlToPlainText(html: string): string {
  if (!html || !html.trim()) return "";
  return html
    .replace(/<p[^>]*>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type TiptapEditorProps = {
  /** Plain text content (from DB) */
  content: string;
  /** Called with plain text when content changes */
  onChange?: (plainText: string) => void;
  /** Placeholder when empty */
  placeholder?: string;
  /** Min height in pixels */
  minHeight?: number;
  /** Disable editing */
  readOnly?: boolean;
  /** When set, enables AI actions (BubbleMenu + context menu) for the given application */
  applicationId?: string;
};

const AI_ACTIONS: { cmd: TransformCommand; label: string; icon: ReactNode }[] = [
  { cmd: "rewrite", label: "Rewrite", icon: <Sparkles className="h-4 w-4" /> },
  { cmd: "formal", label: "Make More Formal", icon: <Scale className="h-4 w-4" /> },
  { cmd: "uscis", label: "Adjust for USCIS", icon: <Flag className="h-4 w-4" /> },
  { cmd: "simplify", label: "Simplify Language", icon: <Brain className="h-4 w-4" /> },
];

function TiptapMenuBar({ editor }: { editor: Editor | null }) {
  if (!editor || editor.isDestroyed) return null;
  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 px-2 py-1.5">
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={`rounded p-1.5 transition-colors ${editor.isActive("bold") ? "bg-gray-300 dark:bg-gray-600 text-gray-900 dark:text-white" : "text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"}`}
        title="Negrito (Ctrl+B)"
      >
        <Bold className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={`rounded p-1.5 transition-colors ${editor.isActive("italic") ? "bg-gray-300 dark:bg-gray-600 text-gray-900 dark:text-white" : "text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"}`}
        title="Itálico (Ctrl+I)"
      >
        <Italic className="h-4 w-4" />
      </button>
      <span className="h-4 w-px bg-gray-300 dark:bg-gray-600 mx-0.5" aria-hidden />
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={`rounded p-1.5 transition-colors ${editor.isActive("bulletList") ? "bg-gray-300 dark:bg-gray-600 text-gray-900 dark:text-white" : "text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"}`}
        title="Lista com marcadores"
      >
        <List className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={`rounded p-1.5 transition-colors ${editor.isActive("orderedList") ? "bg-gray-300 dark:bg-gray-600 text-gray-900 dark:text-white" : "text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"}`}
        title="Lista numerada"
      >
        <ListOrdered className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        className={`rounded p-1.5 transition-colors ${editor.isActive("blockquote") ? "bg-gray-300 dark:bg-gray-600 text-gray-900 dark:text-white" : "text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"}`}
        title="Citação"
      >
        <Quote className="h-4 w-4" />
      </button>
    </div>
  );
}

export function TiptapEditor({
  content,
  onChange,
  placeholder = "Digite aqui...",
  minHeight = 200,
  readOnly = false,
  applicationId,
}: TiptapEditorProps) {
  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    from: number;
    to: number;
    text: string;
  } | null>(null);
  const [aiLoading, setAiLoading] = useState<TransformCommand | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const ctxMenuRef = useRef<HTMLDivElement | null>(null);

  const editor = useEditor({
    extensions: [StarterKit],
    content: plainToHtml(content),
    immediatelyRender: false,
    editable: !readOnly,
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: {
        class: "tiptap-content focus:outline-none min-h-[180px] px-4 py-3",
      },
    },
    onUpdate: ({ editor }) => {
      onChange?.(htmlToPlainText(editor.getHTML()));
    },
  });

  const runTransform = useCallback(
    async (cmd: TransformCommand, from: number, to: number, text: string) => {
      if (!applicationId || !editor) return;
      setCtxMenu(null);
      setAiLoading(cmd);
      setAiError(null);
      const res = await transformSelectionWithAI(applicationId, text, cmd);
      setAiLoading(null);
      if (res.success && res.text) {
        editor
          .chain()
          .focus()
          .deleteRange({ from, to })
          .insertContentAt(from, plainToHtml(res.text))
          .run();
      } else {
        setAiError(res.error || "Erro ao transformar");
      }
    },
    [applicationId, editor]
  );

  useEffect(() => {
    if (!editor?.view?.dom || readOnly || !applicationId) return;
    const el = editor.view.dom;
    const handler = (e: MouseEvent) => {
      const { from, to } = editor.state.selection;
      const text = editor.state.doc.textBetween(from, to);
      if (!text.trim()) return;
      e.preventDefault();
      setCtxMenu({ x: e.clientX, y: e.clientY, from, to, text });
    };
    el.addEventListener("contextmenu", handler);
    return () => el.removeEventListener("contextmenu", handler);
  }, [editor, readOnly, applicationId]);

  useEffect(() => {
    if (!ctxMenu) return;
    const onMouseDown = (e: MouseEvent) => {
      if (ctxMenuRef.current?.contains(e.target as Node)) return;
      setCtxMenu(null);
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [ctxMenu]);

  return (
    <div
      className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden"
      style={{ minHeight }}
    >
      {!readOnly && <TiptapMenuBar editor={editor} />}
      {applicationId && !readOnly && editor && !editor.isDestroyed && (
        <BubbleMenu editor={editor} pluginKey="aiBubbleMenu">
          <div className="flex flex-wrap items-center gap-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1.5 shadow-lg">
            {AI_ACTIONS.map(({ cmd, label, icon }) => (
              <button
                key={cmd}
                type="button"
                disabled={!!aiLoading}
                onClick={() => {
                  const { from, to } = editor.state.selection;
                  runTransform(cmd, from, to, editor.state.doc.textBetween(from, to));
                }}
                className="flex items-center gap-1.5 rounded px-2 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50"
              >
                {aiLoading === cmd ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  icon
                )}
                <span>{label}</span>
              </button>
            ))}
            {aiError && (
              <p className="w-full px-2 py-1 text-xs text-red-600 dark:text-red-400">
                {aiError}
              </p>
            )}
          </div>
        </BubbleMenu>
      )}
      <EditorContent editor={editor} />
      {ctxMenu &&
        createPortal(
          <div
            ref={ctxMenuRef}
            className="fixed z-[100] flex flex-col rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 py-1 shadow-xl"
            style={{ left: ctxMenu.x, top: ctxMenu.y }}
          >
            {AI_ACTIONS.map(({ cmd, label, icon }) => (
              <button
                key={cmd}
                type="button"
                className="flex items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                onClick={() =>
                  runTransform(cmd, ctxMenu.from, ctxMenu.to, ctxMenu.text)
                }
              >
                {icon}
                <span>{label}</span>
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}
