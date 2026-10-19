-- =============================================================================
-- Wiwaha OS · Content Studio (D41)
--
-- Brought over from wiwaha-studio: the brand profile, scripts with one
-- approval gate, the content calendar, and the rendered carousels, posts,
-- stories and reels the team downloads and posts themselves. Pictures come
-- from the estate's own media library; AI imagery is only for things that are
-- not the venue. Generation runs on fal (one FAL_KEY) and Claude.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- The brand profile (one row): persona, voice, CTA, hashtags, palette, logos.
-- Seeded from the client's "Digital Brand Persona" as transcribed in
-- wiwaha-studio; the team edits it on the Brand page.
-- ---------------------------------------------------------------------------
create table public.studio_brand (
  id smallint primary key default 1 check (id = 1),
  profile jsonb not null default '{}'::jsonb,
  logo_url text,          -- the full logo on a transparent background (dark ink)
  logo_light_url text,    -- the same in ivory, for dark pictures
  mark_url text,          -- the small mark for reels
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
create trigger studio_brand_touch before update on public.studio_brand
  for each row execute function app.touch_updated_at();
alter table public.studio_brand enable row level security;
create policy studio_brand_read on public.studio_brand for select using (app.has_role('owner', 'sales'));
create policy studio_brand_write on public.studio_brand for update
  using (app.has_role('owner', 'sales')) with check (app.has_role('owner', 'sales'));
select app.enable_audit('public.studio_brand');

insert into public.studio_brand (id, profile) values (1, $j${
  "brand_name": "WIWAHA by Praman",
  "tagline": "Your Wedding, Your Way",
  "description": "WIWAHA by Praman is a private 4-acre wedding estate 15 km from Bangalore Airport (Devanahalli, Karnataka) that delivers five-star elegance with complete customization freedom: private estate charm with five-star infrastructure.",
  "positioning": "For affluent couples who refuse to compromise between luxury and authenticity, WIWAHA by Praman is the private wedding estate that delivers five-star elegance with complete customization freedom, just 15 km from Bangalore Airport, because your wedding should reflect who you are as a couple, not what a venue dictates.",
  "voice": "The Inspiring Best Friend who happens to be the expert: reassuring, knowledgeable, aspirational yet grounded. Conversational elegance, sophisticated but never stuffy. Blends luxury words (bespoke, curated, intimate) with warm, relatable ones (dream, magic, celebrate). Confident and calming: 'We've got this handled.' Acknowledge the couple's stress before offering the solution.",
  "audience": "The modern affluent couple, 25 to 35, wedding budget ₹30 to 50 lakhs, 150 to 300 guests; values authenticity, customization, experience over opulence and Instagram aesthetics. Parents make 60 to 70% of the final venue decision: safety, reputation, guest comfort, value, hassle-free planning.",
  "pain_points": ["Hotels feel impersonal and cookie-cutter", "Farmhouses compromise on quality and infrastructure", "Guest logistics and accommodation are a nightmare", "Vendor coordination stress and hidden costs", "Venues that dictate the wedding instead of enabling it"],
  "differentiators": ["The closest luxury private venue to Bangalore Airport", "Private estate charm with five-star infrastructure", "Premium in-house catering, or bring your own caterer", "30 rooms (expanding to 60), complimentary with booking", "A 4-acre exclusive estate, not a hotel corner", "Your vision, our execution"],
  "pillars": ["Venue showcase", "Educational / planning tips", "Feature focus (the WIWAHA advantage)", "Problem → solution", "Behind the scenes", "Festival & seasonal", "Guest experience"],
  "writing_style": "Conversational elegance. Short, confident sentences. Speak to the couple as a trusted friend who has done this a hundred times. Story-driven: the couple is the hero, WIWAHA is the guide. Never salesy, never stuffy, never generic.",
  "dos": ["Lead with empathy, then the solution", "Use real venue photos and footage", "One warm call to action per post"],
  "donts": ["Don't show the venue as AI-generated imagery; real photos only", "Don't use engagement-bait CTAs (tag, save, comment, link in bio)", "Don't invent facts, prices or testimonials", "Don't sound salesy or stuffy"],
  "hashtags": ["#WiwahaWeddings", "#WiwahaByPraman", "#YourWeddingYourWay", "#BangaloreWeddings", "#DestinationWeddingIndia", "#LuxuryWeddingVenue", "#AirportWeddingVenue", "#BangaloreAirportVenue", "#DevanahalliWeddings", "#PrivateWeddingEstate", "#BespokeWeddings", "#DreamWeddingVenue"],
  "hashtag_rule": "8 to 12 hashtags: 2 to 3 branded, 3 to 4 primary, 2 to 3 location, 1 to 2 experience.",
  "ctas": ["Call or WhatsApp us on +91 9169935666", "Check your date with us: +91 9169935666", "Book your venue tour: +91 9169935666"],
  "caption_format": "Hook line first. 2 to 4 short paragraphs, conversational. A clear CTA. Then the hashtags on their own block.",
  "voiceover": "Indian English (Bangalore), polished and natural. Warm, measured, reassuring; confident without hype. Calm, soothing, expressive.",
  "visual_style": "Real venue photography first. Contemporary luxury with traditional warmth. Earthy luxury palette: sage greens, warm golds, ivory whites. Clean, airy compositions with generous negative space; refined, minimal typography.",
  "photography": "Natural light, candid moments, lush greenery, golden-hour magic. Real venue spaces and real celebrations.",
  "colors": {"olive": "#454E3D", "sage": "#9EA19A", "ivory": "#D5D2CB", "gold": "#B8955A", "burgundy": "#6B2A3A", "white": "#F7F5F0"},
  "fonts": {"display": "Cormorant Garamond", "text": "Poppins"},
  "handle": "@wiwahabypraman",
  "pillar_presets": [
    {"key": "venue_showcase", "label": "Venue showcase", "hint": "The lawn, amphitheatre, rooms and décor at their most beautiful"},
    {"key": "planning_tips", "label": "Educational / planning tips", "hint": "Wedding planning advice, checklists, vendor guidance"},
    {"key": "feature_focus", "label": "Feature focus", "hint": "One WIWAHA advantage at a time: airport proximity, catering freedom, rooms"},
    {"key": "problem_solution", "label": "Problem → solution", "hint": "A real wedding-planning pain point and how WIWAHA removes it"},
    {"key": "behind_the_scenes", "label": "Behind the scenes", "hint": "Setups, the team, décor coming together"},
    {"key": "festival_seasonal", "label": "Festival & seasonal", "hint": "Festivals, wedding season, monsoon or winter weddings"},
    {"key": "guest_experience", "label": "Guest experience", "hint": "Comfort, hospitality, stays, the feeling of being looked after"},
    {"key": "testimonials", "label": "Testimonials & social proof", "hint": "Only with real quotes you have consent to share"}
  ]
}$j$::jsonb)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Calendar plans: a week or four weeks of posts from chosen pillars and a mix.
-- ---------------------------------------------------------------------------
create table public.studio_plans (
  id uuid primary key default gen_random_uuid(),
  start_on date not null,
  end_on date not null check (end_on >= start_on and end_on - start_on <= 41),
  posts_per_week smallint not null check (posts_per_week between 1 and 7),
  mix jsonb not null default '{"reel":40,"carousel":40,"single_post":20}'::jsonb,
  pillars text[] not null default '{}',
  notes text,
  status text not null default 'planning' check (status in ('planning', 'ready', 'failed')),
  rationale text,
  error text,
  created_by uuid references public.profiles(id) default auth.uid(),
  created_by_agent text references public.agents(key),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger studio_plans_touch before update on public.studio_plans
  for each row execute function app.touch_updated_at();
alter table public.studio_plans enable row level security;
create policy studio_plans_rw on public.studio_plans for all
  using (app.has_role('owner', 'sales')) with check (app.has_role('owner', 'sales'));
select app.enable_audit('public.studio_plans');

-- ---------------------------------------------------------------------------
-- Scripts (content items): read, edit, request a change, approve, generate.
-- One gate: approving a script is what starts the render.
-- ---------------------------------------------------------------------------
create table public.studio_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid references public.studio_plans(id) on delete set null,
  content_type text not null check (content_type in ('reel', 'carousel', 'single_post', 'story')),
  scheduled_for date,
  pillar text,
  title text not null default 'Untitled',
  brief text,                       -- what the team asked for
  hook text,
  script text,                      -- reel voiceover, or the slide outline
  caption text,
  hashtags text[] not null default '{}',
  options jsonb not null default '{}'::jsonb,   -- slides, seconds, aspect, chosen photos, direction, voice
  status text not null default 'drafting' check (status in ('drafting', 'draft', 'approved', 'generating', 'generated', 'failed', 'discarded')),
  change_count integer not null default 0,
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  outputs jsonb not null default '{}'::jsonb,   -- {slides:[url…], video_url, poster_url, zip_url}
  progress jsonb not null default '{}'::jsonb,  -- where the render is: {stage, done, total, note}
  error text,
  created_by uuid references public.profiles(id) default auth.uid(),
  created_by_agent text references public.agents(key),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index studio_items_status_idx on public.studio_items(status, scheduled_for);
create trigger studio_items_touch before update on public.studio_items
  for each row execute function app.touch_updated_at();
alter table public.studio_items enable row level security;
create policy studio_items_rw on public.studio_items for all
  using (app.has_role('owner', 'sales')) with check (app.has_role('owner', 'sales'));
select app.enable_audit('public.studio_items');

-- ---------------------------------------------------------------------------
-- Render pieces: each slide of a carousel, each shot of a reel, the voiceover
-- and the music bed. The media worker moves them from queued to ready.
-- ---------------------------------------------------------------------------
create table public.studio_renders (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.studio_items(id) on delete cascade,
  kind text not null check (kind in ('slide', 'shot', 'voice', 'music', 'reel')),
  idx integer not null default 0,
  spec jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'rendering', 'ready', 'failed', 'skipped')),
  source_url text,      -- the picture or clip it starts from
  result_url text,      -- the finished slide / shot clip / audio
  edits integer not null default 0,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (item_id, kind, idx)
);
create trigger studio_renders_touch before update on public.studio_renders
  for each row execute function app.touch_updated_at();
alter table public.studio_renders enable row level security;
create policy studio_renders_read on public.studio_renders for select using (app.has_role('owner', 'sales'));

-- ---------------------------------------------------------------------------
-- Usage ledger: generations and slide edits, against the monthly allowance.
-- ---------------------------------------------------------------------------
create table public.studio_usage (
  id bigint generated always as identity primary key,
  item_id uuid references public.studio_items(id) on delete set null,
  kind text not null check (kind in ('generation', 'slide_edit', 'regeneration')),
  units integer not null default 1 check (units > 0),
  by_user uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index studio_usage_month_idx on public.studio_usage(created_at);
alter table public.studio_usage enable row level security;
create policy studio_usage_read on public.studio_usage for select using (app.has_role('owner', 'sales'));

-- ---------------------------------------------------------------------------
-- Policy: the studio's content rules (from the client, 2026-09-03 and -05).
-- ---------------------------------------------------------------------------
do $m$
begin
  perform set_config('app.change_note', 'Content Studio brought into Wiwaha OS (D41), with the client''s content rules from wiwaha-studio.', true);
  insert into public.policies (key, topic, title, rule_text, value, client_visible, needs_confirmation, sort)
  values ('studio.content', 'Marketing', 'Content Studio rules',
          'The venue is only ever shown with Wiwaha''s own photos and footage; AI imagery is for details, objects and ideas, never the estate. Every post carries one warm call to action: call or WhatsApp +91 9169935666. Festival greetings close with a warm sign-off instead. Never engagement bait (tag, save, comment, link in bio). Reels never speak the phone number; it is shown on screen. Each script is approved once before anything is rendered; 40 renders a month, with a warning when 20% is left; three free edits per slide; at most two AI-animated clips per reel.',
          '{"contact_number":"+91 9169935666","venue_real_photos_only":true,"no_engagement_bait":true,"festival_signoff_instead_of_cta":true,"monthly_generations":40,"warn_at_pct":20,"slide_edits_per_slide":3,"max_ai_clips_per_reel":2,"reel_seconds":[15,30,45,60],"words_per_second":2.3}'::jsonb,
          false, false, 142)
  on conflict (key) do nothing;
end $m$;

-- ---------------------------------------------------------------------------
-- The fal endpoints live with the agents (like their Claude model), so the
-- owner can change them in Settings without a deploy.
-- ---------------------------------------------------------------------------
update public.agents
   set config = config || '{"media_models":{"image":"fal-ai/nano-banana-pro","image_edit":"fal-ai/nano-banana-pro/edit","tts":"fal-ai/elevenlabs/tts/eleven-v3","voice":"Aria","music":"fal-ai/elevenlabs/music","image_to_video":"minimax/h3-max/image-to-video"}}'::jsonb,
       job = 'Plans the content calendar, writes scripts, renders carousels, posts, stories and reels from the estate''s own photos',
       human_gate = 'Approve each script before it renders'
 where key = 'content_studio';
update public.agents
   set config = config || '{"media_models":{"image_edit":"fal-ai/nano-banana-pro/edit"}}'::jsonb,
       job = 'Décor questionnaire, then a moodboard per function from plain photos of each area; refines on feedback',
       human_gate = 'Décor team shares; décor lead finalises; Prashanth for custom'
 where key = 'design';
