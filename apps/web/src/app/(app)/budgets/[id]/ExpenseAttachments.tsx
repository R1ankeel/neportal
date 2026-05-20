"use client";

import { useCallback, useEffect, useState } from "react";
import { getAttachmentDownloadUrl, getAttachmentPreviewUrl } from "@/lib/api";
import type { ApiBudgetExpenseAttachment } from "@/lib/types";

function ReceiptPreviewModal({
  attachment,
  onClose,
}: {
  attachment: ApiBudgetExpenseAttachment;
  onClose: () => void;
}) {
  const mimeType = attachment.mimeType ?? "";
  const previewUrl = getAttachmentPreviewUrl(attachment.id);
  const downloadUrl = getAttachmentDownloadUrl(attachment.id);
  const isImage = mimeType.startsWith("image/");
  const isPdf = mimeType === "application/pdf";

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [handleKeyDown]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="receipt-preview-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <h3 id="receipt-preview-title" className="text-xl font-semibold">
            Чек
          </h3>
          <div className="flex items-center gap-3">
            <a
              href={downloadUrl}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
            >
              Скачать
            </a>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              aria-label="Закрыть"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="flex min-h-[200px] flex-1 items-center justify-center overflow-auto p-6">
          {isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="Чек"
              className="max-h-[70vh] max-w-full rounded-lg object-contain"
            />
          ) : isPdf ? (
            <iframe
              src={previewUrl}
              title="Чек PDF"
              className="h-[70vh] w-full rounded-lg border border-zinc-200 dark:border-zinc-700"
            />
          ) : (
            <p className="text-center text-lg text-zinc-600 dark:text-zinc-400">
              Предпросмотр для этого типа файла недоступен. Скачайте файл.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function ExpenseAttachments({ attachments }: { attachments: ApiBudgetExpenseAttachment[] }) {
  const [previewId, setPreviewId] = useState<string | null>(null);
  const previewAttachment = attachments.find((a) => a.id === previewId) ?? null;
  const multiple = attachments.length > 1;

  if (attachments.length === 0) {
    return <p className="mt-1 text-sm text-zinc-500">Без чека</p>;
  }

  return (
    <>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
        {attachments.map((a, idx) => {
          const n = idx + 1;
          const viewLabel = multiple ? `Посмотреть чек ${n}` : "Посмотреть чек";
          const downloadLabel = multiple ? `Скачать ${n}` : "Скачать";
          return (
            <span key={a.id} className="inline-flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPreviewId(a.id)}
                className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
              >
                {viewLabel}
              </button>
              <a
                href={getAttachmentDownloadUrl(a.id)}
                className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
              >
                {downloadLabel}
              </a>
            </span>
          );
        })}
      </div>

      {previewAttachment ? (
        <ReceiptPreviewModal attachment={previewAttachment} onClose={() => setPreviewId(null)} />
      ) : null}
    </>
  );
}
