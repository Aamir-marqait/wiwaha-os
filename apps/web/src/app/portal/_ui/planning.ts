import { addDays, daysBetween, todayIST } from "@wiwaha/db";

/** Planning (and the rest of the portal) opens this many days before the first event. Until then the family can share ideas. */
export const PLANNING_OPENS_DAYS_BEFORE = 90;

export function planningState(eventStart: string): { days: number; open: boolean; opensOn: string; daysUntilOpen: number } {
  const days = daysBetween(todayIST(), eventStart);
  return { days, open: days <= PLANNING_OPENS_DAYS_BEFORE, opensOn: addDays(eventStart, -PLANNING_OPENS_DAYS_BEFORE), daysUntilOpen: Math.max(0, days - PLANNING_OPENS_DAYS_BEFORE) };
}
