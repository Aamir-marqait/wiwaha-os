# Phase 1 demo script (about 10 minutes, on a phone)

**Logins** (password for all: `WiwahaDemo!2026`, demo data only)

| Who | Email | Sees |
| --- | --- | --- |
| Prashanth (owner) | prashanth@wiwaha.example | Everything, including approvals, policy edits, agent controls and the audit log |
| Kavya (sales) | kavya@wiwaha.example | Leads, calendar, lead-reply approvals |
| Arjun (event manager) | arjun@wiwaha.example | His weddings, calendar |
| Manjunath (estate staff) | manju@wiwaha.example | Only his own tasks |
| Lakshmi (accounts) | lakshmi@wiwaha.example | Payments, weddings |
| Ananya (bride, portal) | ananya@wiwaha.example | Her own wedding portal at `/portal` |

## 1. An enquiry comes in (2 min)
1. On your phone, open **/enquire**. Enter a name, a phone number, a date, 220 guests, city **Mumbai**, and the message *"Roughly what does a wedding cost? Do you have rooms?"*. Submit.
2. Sign in as Prashanth. **Leads** shows the new lead, de-duplicated by phone and scored by Lead Desk. Open it to see *Why this score* (weights come from the policy book).
3. **Approvals** shows the drafted reply. It answers about rooms and offers a video tour, but **quotes no price**: no out-of-town band is approved yet. **Today → Needs a person** shows the escalation: *"… (Mumbai) asked for a starting price"*.
4. Tap **Edit**, tweak a sentence, then **Save & approve**.

## 2. Change a rule, and the agent's answer changes (2 min)
1. **Settings → Policy book → Pricing on calls**. In the settings, set `"starting_from_paise": 2500000000` (₹25 lakh). Add a note and save. It becomes version 2.
2. Go back to the lead and press **Re-run Lead Desk**. The new draft in Approvals says *"Celebrations here start from ₹25,00,000…"*. The old draft is retired automatically.

## 3. The calendar is the single truth (2 min)
1. **Calendar → Hold a date**: choose Sage Hall and a date, then **Place soft hold**. It expires after the policy's 72 hours.
2. Sign in as Kavya in another browser and try the same space and date: *"That date is already held or booked"*.
3. Expired holds are released by `pg_cron` every 15 minutes (and before any new hold), and the Chief of Staff queues a "your hold lapsed" note to the family for approval.

## 4. The 8:30 am brief (1 min)
**Today → Morning brief → Write now** (the cron does this daily at 8:30 IST). It covers decisions waiting, today's visits, *the one* follow-up call due (Deepak), the hold expiring (Rhea), overdue tasks and the next payment due.

## 5. Control and audit (2 min)
1. **Settings → Agents**: all 21 agents. Chief of Staff and Lead Desk are live in **Draft**; the rest wait for their phase. Flip Lead Desk **off**, and a new enquiry lands in *Needs a person* instead. Flip it back on.
2. **Settings → Activity log**: every agent run (model, tokens, cost, policy versions). The **Edits (audit)** tab shows every human change with user, time and IP.

## 6. The couple's portal (1 min)
Sign in at **/portal/login** as Ananya ("Use a password instead"). Her stage cards show: the brief is in progress, **Ceremonies** is open (press Start), and **Décor & moodboards** is paid for by the 50% advance but opens 90 days before the wedding; until then she can share ideas under **Ideas**.

## 7. Décor moodboards from the couple's answers (3 min, D40)
1. **Décor → Venue areas**: each space with its plain photos (the starred one is the base). Upload a photo from the phone camera.
2. Open Ananya & Rohan's Wedding Room → **Décor**. Once décor has opened and Ananya has sent the questionnaire (portal → Décor: traditions, colours, flowers, touches, then spaces and mood per function), the boards appear here, one per function, each space shown as it is and as it could look. Redo a picture, upload your own edit, or **Download PDF**.
3. **Approvals**: share the boards. Only now do they show in Ananya's portal, where she can shortlist or ask for a change on any picture.

## 8. Content studio (3 min, D41)
1. **Sales & Marketing → Content studio → Brand**: the voice, pillars and logos every script uses.
2. **Library**: the estate's own photos and clips, described automatically.
3. **New**: "A reel about arriving at Wiwaha from the airport". Read and edit the script, then **Approve and render**. Slides or the reel appear on the same page; **Download** gives a zip with the caption. Without `FAL_KEY`, reels are assembled without a voice.
4. **Calendar**: next week's plan, made automatically.

## 9. The money and the day-to-day (3 min, D42)
1. **Dashboard**: the numbers, the pipeline and where leads come from; anything that needs attention.
2. A lead → **Lost**: it asks why. **Sales numbers** shows why leads didn't book.
3. Wedding Room → **Décor**: add a rented chandelier and a bought uruli; mark the uruli arrived: it joins the stock, and both costs land in **Finance**.
4. **Payments** tab: the receipt for the advance (method, schedule, balance); **Prepare invoices now** drafts the final and GST invoices for approval.
5. **See the portal as the couple**, then Back to the Wedding Room.
6. Open the guest page (Links), request an airport pickup: it shows on Arjun's Today.


## 10. The simpler flow (4 min, D44)
1. Open `/enquire` on a phone, fill only name and phone, choose "How did you hear about Wiwaha?": it lands in **Leads** with that answer.
2. Open the lead: tap the stages (instant), book a visit, then **Book the wedding**. You land in the Wedding Room.
3. **Couple's portal** card (top of Overview): **Create login** for Ananya's number, copy the invite (link, number, PIN) or open it in WhatsApp. On another phone, sign in at `/portal/login` with the number and PIN.
4. **Venue → Spaces**: every lawn, hall and corner with photos; **Add photos** on one that has none.
5. **Décor stock**: tap + / − on a piece; **Templates by area → Use for an event**.
6. **Finance → Add a cost**: Ads & marketing, "Meta ads", ₹15,000: the month's costs show ad spend per enquiry.
7. **Calendar → Leads**: visits and the dates families asked for. **Estate**: "Done today" on a maintenance job.
