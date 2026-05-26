"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import type { ApiUser } from "@/lib/types";
import { addTaskComment, type AddCommentState } from "./actions";

const initial: AddCommentState = { ok: true };

export function AddCommentForm({
  taskId,
  authorId,
  projectId,
  users,
}: {
  taskId: string;
  authorId: string;
  projectId?: string | null;
  users: ApiUser[];
}) {
  const [state, action, pending] = useActionState(addTaskComment, initial);
  const [text, setText] = useState("");
  const [selectedMention, setSelectedMention] = useState<{ id: string; fullName: string } | null>(null);
  const [menu, setMenu] = useState<{ query: string; start: number; end: number } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const wasPendingRef = useRef(false);

  const mentionToken = selectedMention ? `@${selectedMention.fullName}` : null;

  useEffect(() => {
    const justFinishedSuccess = wasPendingRef.current && !pending && state.ok;
    if (justFinishedSuccess) {
      setText("");
      setSelectedMention(null);
      setMenu(null);
    }
    wasPendingRef.current = pending;
  }, [pending, state.ok]);

  useEffect(() => {
    if (mentionToken && !text.includes(mentionToken)) {
      setSelectedMention(null);
    }
  }, [mentionToken, text]);

  const mentionOptions = useMemo(() => {
    if (!menu) return [];
    const q = menu.query.trim().toLowerCase();
    const filtered = users.filter((u) => {
      if (u.id === authorId) return false;
      if (!q) return true;
      return (
        u.fullName.toLowerCase().includes(q) ||
        (u.telegramUsername ?? "").toLowerCase().includes(q)
      );
    });
    return filtered.slice(0, 8);
  }, [authorId, menu, users]);

  function detectMention(value: string, cursor: number) {
    const beforeCursor = value.slice(0, cursor);
    const at = beforeCursor.lastIndexOf("@");
    if (at < 0) return null;
    if (at > 0 && /\S/.test(beforeCursor[at - 1] ?? "")) return null;
    const query = beforeCursor.slice(at + 1);
    if (/\s/.test(query)) return null;
    return { query, start: at, end: cursor };
  }

  function handleTextChange(nextValue: string, cursor: number | null) {
    setText(nextValue);
    if (cursor == null) {
      setMenu(null);
      return;
    }
    setMenu(detectMention(nextValue, cursor));
  }

  function selectMention(user: ApiUser) {
    if (!menu) return;
    const nextText = `${text.slice(0, menu.start)}@${user.fullName} ${text.slice(menu.end)}`;
    setText(nextText);
    setSelectedMention({ id: user.id, fullName: user.fullName });
    setMenu(null);
    queueMicrotask(() => {
      const target = textareaRef.current;
      if (!target) return;
      const caret = menu.start + user.fullName.length + 2;
      target.focus();
      target.setSelectionRange(caret, caret);
    });
  }

  return (
    <form action={action} className="mt-4 space-y-3">
      <input type="hidden" name="taskId" value={taskId} />
      <input type="hidden" name="authorId" value={authorId} />
      {projectId ? <input type="hidden" name="projectId" value={projectId} /> : null}
      {selectedMention ? <input type="hidden" name="mentionedUserId" value={selectedMention.id} /> : null}
      <textarea
        ref={textareaRef}
        name="text"
        rows={3}
        required
        placeholder="Комментарий…"
        className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-base dark:border-zinc-700 dark:bg-zinc-950"
        disabled={pending}
        value={text}
        onChange={(e) => handleTextChange(e.target.value, e.target.selectionStart)}
        onKeyUp={(e) => {
          const target = e.currentTarget;
          handleTextChange(target.value, target.selectionStart);
        }}
      />
      {menu && mentionOptions.length > 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-2 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
          <p className="px-2 pb-1 text-xs text-zinc-500">Выберите сотрудника</p>
          <ul className="max-h-44 space-y-1 overflow-auto">
            {mentionOptions.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() => selectMention(u)}
                  className="w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  <span className="font-medium">{u.fullName}</span>
                  {u.telegramUsername ? (
                    <span className="ml-2 text-zinc-500">@{u.telegramUsername}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {state.message ? (
        <p className="text-sm text-amber-800 dark:text-amber-200">{state.message}</p>
      ) : null}
      {state.saved ? (
        <p className="text-sm text-emerald-700 dark:text-emerald-400">Комментарий добавлен</p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-zinc-900 px-5 py-3 text-base font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {pending ? "Отправка…" : "Добавить комментарий"}
      </button>
    </form>
  );
}
