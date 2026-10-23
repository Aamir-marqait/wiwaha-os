# Website enquiry form

Every enquiry from the form lands in **Leads** at once (source "Website form", plus the answer to "How did you hear about Wiwaha?"). The team can still add leads by hand (Leads → New lead).

## The link

The form lives on the Wiwaha website: `https://www.wiwahabypraman.com/enquire`. Use it on Instagram, WhatsApp replies, Google Business and anywhere a plain link works. The "Make an Enquiry" and "Request a Callback" buttons on the website open the same form in a pop-up.

How it reaches the OS: the website form posts to the website's `/api/enquire`, which forwards to this app's `/api/leads`. Set `WIWAHA_OS_URL` in the website's Vercel project if the OS is not at `https://wiwaha-os.vercel.app`.

Fallback: `https://wiwaha-os.vercel.app/enquire` still works (and `?embed=1` for an iframe), but share the website link.

## Fields

Name and phone are required; everything else is optional: date (or "flexible"), guests, type of event, how they heard about us, email, city, message.

## Editing "How did you hear about Wiwaha?"

Settings → Lists → **How people hear about us**. Add, rename, reorder or switch off options; leads keep the words they chose.
