/**
 * Design's human gates (policy "moodboards", "decor.providers"):
 *  - the couple shortlists; the décor lead (event manager) finalises
 *  - any custom (non-catalogue) design needs Prashanth's approval
 *    (approval kind `custom_decor`)
 *  - nothing is generated before the décor stage's payment unlock: the
 *    database refuses moodboards before the payment part that signs the contract
 */
export const DESIGN_GATE = { customApproval: "custom_decor", decorLeadRole: "event_manager" } as const;
