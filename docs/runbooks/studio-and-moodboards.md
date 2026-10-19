# Content studio and AI moodboards

Both run on two keys: `ANTHROPIC_API_KEY` (already set) for writing, and `FAL_KEY` for pictures, voice, music and clips. Decisions: D39–D41.

## Turn it on
1. Create a fal account and an API key (fal.ai → Keys). Add billing; a moodboard costs a few image edits, a reel a voiceover, a music bed and at most two short clips.
2. Vercel → wiwaha-os → Settings → Environment Variables: add `FAL_KEY` (Production and Preview). Redeploy.
3. Check: the Content studio page shows "AI pictures, voice and music: on" (it says "Offline mode" without the key). Until then everything runs in sandbox: moodboards show the plain photo with the décor described, reels are assembled silently from photos.

Model names live in `agents.config.media_models` (Content studio and Design agents), not in code; change them there. Their prices sit beside them in `agents.config.media_prices`, so every job records what it cost (D42).

## What it costs (fal list prices, October 2026)
| Work | Model | Price | Typical |
| --- | --- | --- | --- |
| Moodboard picture | Nano Banana Pro edit | $0.15 each | ~20 a wedding ≈ $3 (₹260), plus redos |
| Post detail picture (not the venue) | Nano Banana | $0.039 each | a few cents a post |
| Reel voiceover | ElevenLabs v3 | $0.10 per 1,000 characters | ≈ $0.04 a reel |
| Reel music | ElevenLabs music | $0.60 per started minute | $0.60 a reel |
| Reel clip from a photo | MiniMax 768p | ≈ $0.08 a second | ≤ 2 clips ≈ $0.80 |

A reel costs about $1.50 (₹130) with music and two clips; carousels and posts from real photos cost nothing in AI. Today → AI credits shows the month's spend against the budget (policy `media.budget`) and, with a fal key that can read billing, the live balance. Top up at fal.ai → Billing. To save on reels, turn down `studio.content.max_ai_clips_per_reel`; to save on moodboards, switch `image_edit` to `fal-ai/bytedance/seedream/v4/edit` ($0.03) and compare.

## Before the first moodboard
1. Décor → Venue areas: for each area upload plain photos (empty space, daylight, a few angles) and star the best one as primary. Add decorated or real-event photos too; they guide the look.
2. Décor → Templates by area: link your standard designs to their area.
3. A wedding's Décor stage opens 90 days out (once the advance is paid); when the couple starts it, the questionnaire appears in their portal and they get a message. Never earlier. Wedding Room → Décor → "Send reminder" nudges them; "Make moodboards now" makes boards from whatever they've answered.
4. When the couple sends it, boards are made per function. They wait in Approvals (kind moodboard) until Prashanth shares them. In the Wedding Room you can redo a picture, upload your own edit, upload an edited PDF, or start over.

## Content studio
- Brand: check the profile and upload the logos (dark, ivory and small mark).
- Library: upload the best real photos and clips. Each is described automatically; fix descriptions where wrong.
- Calendar: next week is planned automatically each week; plan one or four weeks yourself, with festivals or open days in the notes.
- Each item: edit or approve the script → it renders → download the zip and post. Monthly allowance and edit limits: Settings → Policy book → `studio.content`.

## Troubleshooting
- Stuck on "Rendering": the 15-minute tick resumes it; "Check now" on the item kicks the worker. `media_jobs.error` says why a job failed.
- A reel over ~60 s or many clips may hit the Vercel function limit (300 s on Pro); the worker resumes on the next pass.
- fal webhooks need the deployment URL to be public (`NEXT_PUBLIC_APP_URL`).
