# Open questions and PRD issues

Things Fable/Claude flagged while building Phase 1. Each needs a decision from Prashanth or Sid. The policy book marks affected rules "Needs confirmation", and agents escalate instead of guessing until they're confirmed.

## Needs a value from Prashanth (PRD §14)
| Question | Where it lives | Current behaviour |
| --- | --- | --- |
| "Starting from" band for out-of-town callers, and what counts as out of town | Policy `pricing.phone` (`out_of_town_band.starting_from_paise`, `local_cities`) | No figure set, so agents never quote one and escalate the family to Prashanth |
| How long a soft hold lasts before the 10% deposit | Policy `holds.soft_hold` | 72 hours (PRD recommendation #2) |
| Gift budget and options | Policy `farewell` | Options set, budget empty |
| Voice languages on day one | Policy `languages` | All five listed |
| Cancellation and refund terms per milestone | Not yet in the policy book | Agents escalate any refund question |
| Standard vs custom décor and menus, with prices | `price_book_items` (placeholders) | Demo prices only |
| Predefined vendors and how they're paid | `vendors` (placeholders) | Demo vendors only |
| Licence to other venues? | Schema is single-tenant (decision D2) | Needs a migration before a second venue |
| Real space names and capacities | `spaces` seed (placeholders) | 5 demo spaces |

## Contradictions or gaps spotted in the PRD
1. **Phase scope.** PRD §13 puts lead scoring and the approval queue in Phase 2; the build handoff puts them in Phase 1. I followed the handoff.
2. **Contract signing vs payment.** "40% within two weeks signs the contract" reads as if the payment *is* the signature, while §5.1 has e-signature and "Prashanth signs contracts". I modelled them separately: the 40% unlocks stages; the contract row has its own signed status (Phase 3).
3. **Vendors stage card.** It's recommended "after décor and menu final" but unlocks on "quote approved". Both are kept: the recommendation is a label and the unlock is the quote.
4. **Enquiry entries on the calendar.** The handoff colour-codes enquiry / held / confirmed, but doesn't say whether an enquiry blocks a date. I made enquiries non-blocking pencil marks; only held and confirmed block.
5. **"Clear pricing" in the brand persona vs "no prices on the phone".** These don't conflict (pricing is clear *in person*), but Lead Desk's template says so explicitly to stay on-brand.
6. **Encrypted phone numbers (§9) vs de-duplication by phone (§4.2).** These need a blind index; see decision D9.
7. **Final payment card** unlocks on "quote approved", but the 50% is due at T-30 regardless. The payment schedule doesn't depend on the card.
