/**
 * Design's human gates (policies "moodboards", "decor.providers", "decor.ai_moodboards"):
 *  - AI moodboards: the décor team reviews them before the couple sees them
 *    (approval kind `moodboard`), unless the owner turns the dial up
 *  - the couple shortlists; the décor lead (event manager) finalises
 *  - any custom (non-catalogue) design needs Prashanth's approval
 *    (approval kind `custom_decor`)
 *  - nothing is generated before the décor stage's payment unlock: the
 *    database refuses moodboards before the payment part that signs the contract
 */
export const DESIGN_GATE = { customApproval: "custom_decor", shareApproval: "moodboard", decorLeadRole: "event_manager" } as const;
