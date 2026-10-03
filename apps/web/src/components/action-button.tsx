"use client";
import { buttonClass } from "@wiwaha/ui";
import { useState, useTransition } from "react";

/** Calls a server action and shows its error, if any. */
export function ActionButton({
  action,
  children,
  pendingLabel = "Working…",
  variant = "secondary",
  size = "sm",
  confirm,
}: {
  action: () => Promise<{ error?: string } | void>;
  children: React.ReactNode;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "gold";
  size?: "sm" | "md" | "lg";
  confirm?: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        className={buttonClass(variant, size)}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          setError(null);
          start(async () => {
            const res = await action();
            if (res && res.error) setError(res.error);
          });
        }}
      >
        {pending ? pendingLabel : children}
      </button>
      {error ? <span role="alert" className="max-w-xs text-right text-xs text-burgundy-700">{error}</span> : null}
    </span>
  );
}
