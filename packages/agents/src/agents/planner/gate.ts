/**
 * Planner's gates: the T-minus plan is internal and goes straight onto
 * people's task lists (the event manager is told and can edit it). The
 * run-of-show is shared with vendors, so the event manager approves it first.
 */
export const PLANNER_GATE = { runOfShowApproval: "run_of_show", reviewRole: "event_manager" } as const;
