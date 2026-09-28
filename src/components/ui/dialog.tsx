"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

export function Dialog({
  title,
  onClose,
  busy = false,
  wide = false,
  children,
}: {
  title: string;
  onClose: () => void;
  busy?: boolean;
  wide?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current!;
    dialog.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      previous?.focus({ preventScroll: true });
      // Saving can disable the opener in the same commit as the dialog closes.
      // Restore once the updated enabled state reaches the DOM, without stealing
      // focus from another dialog that may have opened in the meantime.
      requestAnimationFrame(() => {
        if (previous?.isConnected && !document.querySelector("dialog[open]"))
          previous.focus({ preventScroll: true });
      });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const dialog = event.currentTarget;
        const targets = [
          ...dialog.querySelectorAll<HTMLElement>(
            'button, a[href], input:not([type="hidden"]), select, textarea, [tabindex]',
          ),
        ].filter(
          (node) =>
            !node.matches(":disabled") &&
            node.tabIndex >= 0 &&
            node.getClientRects().length > 0,
        );
        const first = targets[0];
        const last = targets.at(-1);
        if (!first || !last) {
          event.preventDefault();
          dialog.focus();
          return;
        }
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === dialog)
        ) {
          event.preventDefault();
          last.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last || document.activeElement === dialog)
        ) {
          event.preventDefault();
          first.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      className="app-dialog"
      style={wide ? { maxWidth: "72rem" } : undefined}
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-slate-100 bg-white px-4 py-3 sm:px-5">
        <h2 id={titleId} className="min-w-0 break-words text-lg font-semibold">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          aria-label="关闭弹窗"
          className="secondary-button shrink-0"
        >
          关闭
        </button>
      </div>
      <fieldset disabled={busy} className="min-w-0 p-4 sm:p-5">
        {children}
      </fieldset>
    </dialog>
  );
}
