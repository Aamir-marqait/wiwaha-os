import type { PolicyKey } from "@wiwaha/policy";
import { formatDateIST } from "@wiwaha/db";
import { where } from "../../framework/db";
import { agentDb, proposeClientMessage, writeText } from "../../framework/kit";
import { runAgent, type RunOutcome } from "../../framework/runner";
import type { AgentDeps } from "../../framework/types";
import { ONBOARDING_GATE } from "./gate";
import { ONBOARDING_TOOLS } from "./tools";

export const ONBOARDING = "onboarding";
const POLICIES: readonly PolicyKey[] = ["onboarding.welcome", "planning.start", "portal.stage_cards", "audit.portal_edits", "honesty.commitments"];

/** The 10% deposit arrived: welcome letter, portal logins, and the family WhatsApp group. */
export async function onboardWedding(deps: AgentDeps, weddingId: string): Promise<RunOutcome<{ invited: number; letters: number }>> {
  return runAgent(deps, ONBOARDING, { action: "onboard", weddingId, input: { wedding_id: weddingId }, fallbackTitle: "Welcome a newly booked couple" }, async (ctx) => {
    const db = agentDb(ctx, ONBOARDING_TOOLS);
    const [w] = await db.select<{ id: string; title: string; event_start: string; event_manager_id: string | null; primary_contact_id: string | null; stage: string }>("weddings", { where: { id: weddingId } });
    if (!w) throw new Error("Wedding not found");
    const rules = ctx.book.get("onboarding.welcome");
    const [em] = w.event_manager_id ? await db.select<{ id: string; full_name: string; phone_e164: string | null }>("profiles", { where: { id: w.event_manager_id } }) : [];
    const links = await db.select<{ contact_id: string; relation: string | null; is_key_contact: boolean }>("wedding_contacts", { where: { wedding_id: weddingId } });
    const contacts = links.length ? await db.select<{ id: string; full_name: string; phone_e164: string | null; email: string | null; role: string }>("contacts", { where: { id: where.in(links.map((l) => l.contact_id)) } }) : [];
    const members = await db.select<{ id: string; email: string; user_id: string | null; member_role: string; display_name: string }>("wedding_members", { where: { wedding_id: weddingId } });

    // 1. Portal logins: every family contact with an email gets a membership and an invite.
    let invited = 0;
    for (const c of contacts) {
      if (!c.email) continue;
      let m = members.find((x) => x.email.toLowerCase() === c.email!.toLowerCase());
      if (!m) {
        const role = ["bride", "groom"].includes(c.role) ? "couple" : c.role === "planner" ? "planner" : c.role === "parent" ? "parent" : "family";
        const couple = role === "couple";
        [m] = await db.insert("wedding_members", { wedding_id: weddingId, contact_id: c.id, email: c.email, display_name: c.full_name.split(" ")[0], member_role: role, can_start_stages: couple, can_edit_brief: couple || role === "parent", can_approve: couple, can_view_payments: couple, can_manage_members: couple });
      }
      if (!m!.user_id && deps.auth && deps.channels) {
        const r = await deps.auth.inviteClient({ email: c.email, fullName: c.full_name, redirectTo: `${deps.channels.appUrl}/auth/callback?next=/portal` });
        if (r.ok) invited++;
      }
    }

    // 2. Welcome letter on each policy channel (gated in draft).
    const primary = contacts.find((c) => c.id === w.primary_contact_id) ?? contacts[0] ?? null;
    const first = primary?.full_name.split(" ")[0] ?? w.title;
    const template = `Dear ${first},\n\nCongratulations, and welcome to the Wiwaha family! We're honoured that you've chosen our estate for ${formatDateIST(w.event_start, { day: "numeric", month: "long", year: "numeric" })}.\n\n${em ? `${em.full_name.split(" ")[0]} will be your event manager and your first point of contact. ` : ""}Your planning portal is where it all comes together: each stage has a suggested start date, but you choose when to begin. Your login details are on their way by email.\n\nWe've got this handled, so you can simply enjoy the journey.\n\nWarmly,\nTeam Wiwaha`;
    const letter = await writeText(ctx, { policies: POLICIES, facts: { first_name: first, couple: w.title, event_date: formatDateIST(w.event_start, { day: "numeric", month: "long", year: "numeric" }), event_manager: em?.full_name ?? null }, task: "Write the welcome letter.", template, clientFacing: true });
    let letters = 0;
    for (const ch of rules.channels) {
      const to = ch === "whatsapp" ? primary?.phone_e164 : primary?.email;
      if (!to) continue;
      await proposeClientMessage(ctx, { channel: ch, to, subject: `Welcome to Wiwaha, ${first}`, body: letter.body, weddingId, approvalKind: ONBOARDING_GATE.messageApproval, title: `Welcome letter for ${w.title} (${ch})`, flags: letter.flags });
      letters++;
    }

    // 3. The family WhatsApp group: a task for the event manager with who to add.
    const existing = await db.select("tasks", { where: { wedding_id: weddingId, title: where.in(["Create the family WhatsApp group"]) } });
    if (existing.length === 0) {
      const key = contacts.filter((c) => links.find((l) => l.contact_id === c.id)?.is_key_contact).map((c) => `${c.full_name}${c.phone_e164 ? ` (${c.phone_e164})` : ""}`);
      const staffRoles = rules.whatsapp_group_members.filter((r) => ["owner", "event_manager", "sales"].includes(r));
      const staff = staffRoles.length ? await db.select<{ full_name: string; role: string }>("profiles", { where: { role: where.in(staffRoles), active: true } }) : [];
      await db.insert("tasks", {
        scope: "wedding", wedding_id: weddingId, title: "Create the family WhatsApp group", owner_id: w.event_manager_id, owner_role: "event_manager",
        description: `Add: ${[...key, ...staff.filter((s) => s.role !== "event_manager" || !em || s.full_name === em.full_name).map((s) => `${s.full_name} (Wiwaha)`)].join("; ")}. Then add the Wiwaha number so the Wedding Room agent can log decisions.`,
        due_at: new Date(ctx.now.getTime() + 24 * 3600_000).toISOString(), priority: "high", proof_kind: "tick", created_by_agent: ONBOARDING,
      });
    }
    if (w.stage === "booking" || w.stage === "onboarding") await db.update("weddings", { id: weddingId }, { stage: "planning" });
    await ctx.log({ action: "onboard", status: letters ? "gated" : "ok", weddingId, input: {}, output: { invited, letters }, model: letter.model, inputTokens: letter.inputTokens, outputTokens: letter.outputTokens, costUsdMicros: letter.costUsdMicros, policyKeys: [...POLICIES], policyVersions: ctx.book.versions(POLICIES) });
    return { invited, letters };
  });
}
