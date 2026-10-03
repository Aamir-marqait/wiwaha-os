"use client";
import { buttonClass } from "@wiwaha/ui";
import { useActionState } from "react";
import { inviteStaff } from "./actions";

export function InviteForm() {
  const [state, action, pending] = useActionState(inviteStaff, {});
  const input = "mt-1 block h-10 w-full rounded-xl border border-line bg-white px-3 text-sm";
  return (
    <form action={action} className="space-y-3">
      <label className="block text-sm">Name<input name="full_name" required className={input} /></label>
      <label className="block text-sm">Email<input name="email" type="email" required className={input} /></label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-sm">Role
          <select name="role" className={input} defaultValue="sales">
            <option value="sales">Sales</option><option value="event_manager">Event manager</option><option value="staff">Estate staff</option>
            <option value="accounts">Accounts</option><option value="owner">Owner</option>
          </select>
        </label>
        <label className="block text-sm">Title<input name="title" placeholder="e.g. Sales Executive" className={input} /></label>
      </div>
      {state.error ? <p role="alert" className="text-sm text-burgundy-700">{state.error}</p> : null}
      {state.ok ? <p className="text-sm text-sage-700">{state.ok}</p> : null}
      <button disabled={pending} className={buttonClass("primary", "md", "w-full")}>{pending ? "Sending…" : "Send invite"}</button>
    </form>
  );
}
