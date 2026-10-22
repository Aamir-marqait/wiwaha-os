# Website enquiry form

Every enquiry from the form lands in **Leads** at once (source "Website form", plus the answer to "How did you hear about Wiwaha?"). The team can still add leads by hand (Leads → New lead).

## The link

`https://wiwaha-os.vercel.app/enquire`. Use it on Instagram, WhatsApp replies, Google Business and anywhere a plain link works.

## On the website (embedded)

Paste this where the form should appear:

```html
<iframe id="wiwaha-enquiry" src="https://wiwaha-os.vercel.app/enquire?embed=1"
  title="Enquire about Wiwaha" style="width:100%;border:0;min-height:760px" loading="lazy"></iframe>
<script>
  // Optional: the form tells the page its height (no inner scrollbar) and when it's sent.
  window.addEventListener("message", function (e) {
    if (e.origin !== "https://wiwaha-os.vercel.app") return;
    var f = document.getElementById("wiwaha-enquiry");
    if (e.data && e.data.type === "wiwaha-enquiry-height") f.style.height = e.data.height + "px";
    if (e.data && e.data.type === "wiwaha-enquiry-sent") { /* e.g. fire a Meta/Google conversion event */ }
  });
</script>
```

## Fields

Name and phone are required; everything else is optional: date (or "flexible"), guests, type of event, how they heard about us, email, city, message.

## Editing "How did you hear about Wiwaha?"

Settings → Lists → **How people hear about us**. Add, rename, reorder or switch off options; leads keep the words they chose.
