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
**Today → Morning brief → Write now** (the cron does this daily at 8:30 IST). It covers decisions waiting, today's visits, *the one* follow-up call due (Deepak), the hold expiring (Rhea), overdue tasks and the 40% payment due.

## 5. Control and audit (2 min)
1. **Settings → Agents**: all 21 agents. Chief of Staff and Lead Desk are live in **Draft**; the rest wait for their phase. Flip Lead Desk **off**, and a new enquiry lands in *Needs a person* instead. Flip it back on.
2. **Settings → Activity log**: every agent run (model, tokens, cost, policy versions). The **Edits (audit)** tab shows every human change with user, time and IP.

## 6. The couple's portal (1 min)
Sign in at **/portal/login** as Ananya ("Use a password instead"). Her stage cards show: the brief is in progress, **Ceremonies** can start early (press Start), and **Décor & moodboards** stays locked until the 40% contract payment.
