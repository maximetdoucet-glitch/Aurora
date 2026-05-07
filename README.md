# Aurora Massages — Nijmegen

Single-page site for Aurora Massages (Heidebloemstraat 79, Nijmegen) with a 4-step **request-booking** flow that forwards bookings to the shop owner via email + Telegram, with a **WhatsApp deep-link fallback** that works even if no notifier is configured.

This is the **erotic-vertical variant** of the massage template. Cal.com cannot be used here — its AUP prohibits adult services. For clean / therapeutic shops, swap the booking layer back to the Cal.com proxy (see `EXTRACT-AS-SKILL.md`).

## Run locally

```bash
cd aurora-massages
npx serve . -l 3000        # static files only — no booking notifier
# OR
npx vercel dev             # full stack including /api/booking-request
```

Open http://localhost:3000.

The booking modal works fully offline — Step 4 will hit `/api/booking-request`, fail gracefully if no env vars are set, and the confirmation step still produces a working WhatsApp deep-link the customer can use to send the reservation directly to the shop's number.

## Deploy to Vercel

```bash
npx vercel                                       # link project (interactive, first time)
npx vercel env add RESEND_API_KEY production     # paste, hit enter
npx vercel env add NOTIFY_EMAIL_FROM production  # e.g. notify@auroramassages.nl
npx vercel env add NOTIFY_EMAIL_TO production    # owner email
# optional:
npx vercel env add TELEGRAM_BOT_TOKEN production
npx vercel env add TELEGRAM_CHAT_ID production
npx vercel --prod
```

### Custom domain

Vercel dashboard → Project → Settings → Domains → add `auroramassages.nl`. Vercel will issue the DNS records to point at — share with the client.

### Hosting note (ToS)

Vercel's AUP technically restricts adult content. Aurora's site does not contain explicit material (atmospheric photos + service descriptions only), so it lives in a grey zone — many adult-adjacent sites operate on Vercel without issue. If a takedown ever happens, the build is portable; migrate to **Hetzner Cloud + Caddy** (~€5/mo, content-neutral). Plan B has been kept in mind throughout the build (no Vercel-specific runtime features used beyond serverless functions).

## Drop-in assets

The repo ships without imagery to keep it small. Two READMEs explain what's needed:

- [videos/README.txt](videos/README.txt) — 3 atmospheric MP4 clips for the hero rotator (no people, mood only)
- [images/README.txt](images/README.txt) — suite portraits, sfeer tiles, hero poster, image-break

Site renders cleanly without them — backgrounds fall back to the dark amber gradient — but the live demo needs real content. Use Pexels / Pixabay / the client's own photoshoot.

## How the booking flow works

1. **Step 1** — service (Tantra · B2B · Hamam · Extreme)
2. **Step 2** — date (calendar respects `SHOP_HOURS` in [js/main.js](js/main.js); closed days disabled)
3. **Step 3** — time (static slots from `SHOP_HOURS` × `SLOT_STEP`; no live availability check, by design — manual confirmation = customer screening = a feature in this vertical)
4. **Step 4** — name, phone, optional email + preference + notes, consent
5. **Confirmation** — POST to `/api/booking-request` (best-effort) AND build pre-filled WhatsApp deep-link the customer taps to send

The shop owner gets the request via email and/or Telegram (whichever is configured), then confirms manually with the customer.

## File map

```
aurora-massages/
├── index.html                 single-page site
├── css/style.css              dark-amber design system, all CSS in custom properties
├── js/main.js                 nav + hero rotator + booking modal (request variant)
├── api/
│   └── booking-request.js     Vercel serverless: validates + forwards to email/Telegram
├── images/                    suites, sfeer, hero-poster, break.jpg (drop-in)
├── videos/                    hero-1..3.mp4 (drop-in)
├── package.json
├── vercel.json
├── .env.example
├── .gitignore
├── README.md                  ← you are here
└── EXTRACT-AS-SKILL.md        notes for productizing as a reusable massage-template skill
```

## Where to edit shop-specific things

All shop-specific config lives in **two** places — the future skill extraction will collapse these to one config file:

1. **`index.html`** — copy, addresses, hours table, services, suites, footer
2. **`js/main.js`** — top of file, the `SHOP`, `SHOP_HOURS`, `SERVICES`, `BOOKING_MODE` constants

The CSS is shop-agnostic: tokens at the top of [css/style.css](css/style.css) (`--accent`, `--bg`, `--bone`, font stack) are the only things that should ever change visually per shop.
