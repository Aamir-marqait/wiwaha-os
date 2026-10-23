"use client";
import { buttonClass } from "@wiwaha/ui";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteArea } from "@/app/team/media/actions";

export function DeleteArea({ id }: { id: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-1">
      <button type="button" disabled={pending} onClick={() => { if (window.confirm("Delete this space? Its photos stay in the library.")) start(async () => { const r = await deleteArea(id); if (r.error) setError(r.error); else router.push("/team/spaces"); }); }} className={buttonClass("ghost", "sm", "text-burgundy-700")}>{pending ? "Deleting…" : "Delete this space"}</button>
      {error ? <p role="alert" className="text-xs text-burgundy-700">{error}</p> : null}
    </div>
  );
}
