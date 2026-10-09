# Phases 2–4 demo script (about 25 minutes, on a phone)

> The test pay and sign pages used in steps 3.2 only exist when `ALLOW_SANDBOX_LINKS=true` is set in Vercel (demos only; see D32). Without it, accounts record payments by hand on the wedding page, and WhatsApp/email messages are sent from **To send**.

Use the same logins as the Phase 1 demo (`docs/runbooks/demo-script.md`; password `WiwahaDemo!2026`). Every outside channel is in **sandbox**: WhatsApp, email, calls, payment links and signatures show up under **Settings → Activity** (outbox) instead of being sent. Every agent is in `draft`, so anything going to a family waits in **Approvals** first.

## Phase 2: no enquiry is missed (8 min)
1. **Website chat:** open `/enquire` and tap the chat bubble. Ask *"Is 14 Feb 2027 free for 250 guests? What's the price?"* You get availability from the calendar, an offer to visit, and no price.
2. **Phone:** as Prashanth, open **Phone** (`/team/voice`) and play the seven scenarios: price (local), price from Hyderabad, discount, a booked date, "let me talk to a person", Kannada, and an unknown question. Each one creates or updates a lead with a transcript and summary.
3. **Book a visit:** open the lead, then **Book visit** and pick a slot. The executive gets a WhatsApp brief and the family's confirmation waits in Approvals.
4. **After the visit:** on the lead, record a voice note or paste notes. The recap lands on the lead, and exactly one follow-up call is scheduled two days later.
5. **Sales** shows the funnel by source, response times and calls answered.

## Phase 3: from booked to vendors locked (10 min)
1. On a visited lead, **Booking → Mark as booked**: dates, a value (e.g. ₹20,00,000) and Arjun as event manager. You land in the new Wedding Room.
2. **Approvals → Contract**: read it and approve. In the outbox, open the `/sign/sandbox/…` link and sign. Then open the deposit link `/pay/sandbox/…` and pay (test).
3. On the next tick (or **Approvals**), you get the receipt, the welcome letter, the portal invites and a task to create the family WhatsApp group. The Planner's T-minus plan appears in **Tasks**.
4. Sign in to `/portal` as the couple. Switch the language to **ಕನ್ನಡ** or **हिन्दी**. **Start** the brief and fill in the functions. Try **Décor**: it's locked until the 40% payment.
5. Pay the 40% link. Décor opens: start it, see five moodboards per function (standard and custom labelled), and shortlist one. As Arjun, **Finalise** it. If it's custom, Prashanth approves it.
6. Start **Menus** and approve. The quote is prepared, and a custom line waits for Prashanth (**Set** its price on the wedding page, then approve). The couple approves the quote in the portal, and vendor emails wait in Approvals. Open a `/vendor/reply/…` link to confirm.

## Phase 4: the day and after (7 min)
1. **Tasks** (as Manjunath, on a phone): tick a photo task. Turn on airplane mode, tick another, turn it off, and watch it sync.
2. **Guests & rooms** in the portal: add guests, one of them needing a pickup, then **Send rooming list**. Rooms are assigned without double-booking, and housekeeping and pickup tasks appear.
3. **Numbers** (`/team/owner`, as Prashanth): the five morning numbers, the booking calendar, and profit by wedding and by month.
4. After the event date: **Handover inspection** on the wedding page, then **Approvals** for the final and GST invoices, the deposit decision and the farewell messages, in order.
5. **Marketing**: next week's posts are drafted (one approval per day). Paste ad spend as CSV; the Monday ads report arrives as a recommendation.
6. **Finance → Export** downloads the month's invoices for Tally.
