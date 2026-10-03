/**
 * Chief of Staff's human gate: "Prashanth sets priorities".
 *  - The daily brief is addressed to Prashanth himself, so it is delivered
 *    directly. Approving your own brief before reading it would be pointless.
 *    It never goes to clients.
 *  - Routing never bypasses another agent's gate: the target agent applies its
 *    own dial. Work for an agent that is switched off or not yet built is held
 *    and lands in the human queue.
 */
export const CHIEF_OF_STAFF_GATE = {
  briefDelivery: "direct_to_owner",
  unroutableGoesTo: "human_queue",
} as const;
