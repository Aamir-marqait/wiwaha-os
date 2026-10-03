/**
 * Design's human gates (policy "moodboards", "decor.providers"):
 *  - the couple shortlists; the décor lead (event manager) finalises
 *  - any custom (non-catalogue) design needs Prashanth's approval
 *    (approval kind `custom_decor`)
 *  - nothing is generated before the décor stage's payment unlock: the
 *    database refuses moodboards before the 40% contract payment
 */
export const DESIGN_GATE = { customApproval: "custom_decor", decorLeadRole: "event_manager" } as const;
