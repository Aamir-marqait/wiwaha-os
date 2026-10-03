import type { AgentStore } from "../../framework/types";

/**
 * Chief of Staff has read access across the business and owns the task queue.
 * It is the only agent that routes work to other agents (handoff §5).
 */
export const CHIEF_OF_STAFF_TOOLS = [
  "briefData",
  "saveBrief",
  "queuedAgentTasks",
  "updateAgentTask",
  "claimAgentTask",
  "queueHuman",
  "notify",
] as const satisfies readonly (keyof AgentStore)[];

export type ChiefOfStaffStore = Pick<AgentStore, (typeof CHIEF_OF_STAFF_TOOLS)[number]>;
