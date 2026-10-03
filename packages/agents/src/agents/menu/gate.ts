/**
 * Menu's human gates: the couple approves each proposed menu in the portal
 * (only once the menus stage is open, enforced in the database); the chef
 * confirms every approved menu (a task for the kitchen); messages to the
 * couple are `client_message` approvals while in `draft`.
 */
export const MENU_GATE = { messageApproval: "client_message" } as const;
