import { where, type Db } from "../framework/db";

/**
 * A quote can be prepared once every function has an approved menu (or an
 * outside caterer) and finalised décor. Menu and Design both call this when
 * they finish; the database row in agent_tasks is the hand-off (agents never
 * call each other), and only one open request is ever queued.
 */
export async function maybeRequestQuote(db: Db, weddingId: string, fromAgent: string): Promise<boolean> {
  const functions = await db.select<{ id: string }>("event_functions", { where: { wedding_id: weddingId } });
  if (functions.length === 0) return false;
  const menus = await db.select<{ function_id: string; status: string; outside_caterer: boolean }>("menus", { where: { wedding_id: weddingId } });
  const boards = await db.select<{ function_id: string; status: string }>("moodboards", { where: { wedding_id: weddingId, status: where.in(["finalised", "approved"]) } });
  const ready = functions.every((f) =>
    menus.some((m) => m.function_id === f.id && (m.outside_caterer || ["client_approved", "chef_confirmed"].includes(m.status)))
    && boards.some((b) => b.function_id === f.id));
  if (!ready) return false;
  const open = await db.select("quotes", { where: { wedding_id: weddingId, status: where.in(["draft", "pending_approval", "sent"]) } });
  const queued = await db.select("agent_tasks", { where: { wedding_id: weddingId, kind: "quote_requested", status: where.in(["queued", "routed"]) } });
  if (open.length || queued.length) return false;
  await db.insert("agent_tasks", { kind: "quote_requested", from_agent: fromAgent, wedding_id: weddingId, payload: {} });
  return true;
}
