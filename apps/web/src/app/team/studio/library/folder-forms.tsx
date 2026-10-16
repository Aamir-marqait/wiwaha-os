"use client";
import { buttonClass } from "@wiwaha/ui";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createFolder, deleteFolder } from "@/app/team/media/actions";

export function NewFolder({ parentId }: { parentId: string | null }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await createFolder(name, parentId); if (r.error) setError(r.error); else { setName(""); setError(null); router.refresh(); } }); }}>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New folder" className="h-9 rounded-xl border border-line bg-white px-3 text-sm" />
      <button disabled={pending || !name.trim()} className={buttonClass("secondary", "sm")}>Add folder</button>
      {error ? <span role="alert" className="text-xs text-burgundy-700">{error}</span> : null}
    </form>
  );
}

export function RemoveFolder({ id, parentHref }: { id: string; parentHref: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return <button type="button" disabled={pending} onClick={() => { if (window.confirm("Remove this folder? Its photos move up a level; nothing is deleted.")) start(async () => { await deleteFolder(id); router.push(parentHref); }); }} className={buttonClass("ghost", "sm")}>Remove folder</button>;
}
