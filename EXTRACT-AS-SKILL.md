# Extracting this build into a reusable `massage-template` skill

Notes for converting `aurora-massages/` into a Claude skill the way `barbershop-template` works today.

## The two-variant insight

The `massage-template` skill needs to support **both verticals**, switched by a config flag, because the structural template is the same but the booking layer **must** differ:

| Vertical | Examples | Booking layer | Hosting risk |
|---|---|---|---|
| **Therapeutic / wellness** | Aurora Massages → no, this is wrong. Read the ToS. Real examples: Chill & Refill, Baipho, Kanta Massage | Cal.com proxy (4-step modal, real-time availability) — same as `barbershop-template` | None |
| **Erotic / sensual** | Aurora Massages, Massagewereld, Le Fouet | **Request-booking** (4-step modal, static slots, manual confirm via email + Telegram + WhatsApp deep link) | Vercel AUP grey area — be ready to migrate to Hetzner |

A single `BOOKING_MODE` constant in `js/main.js` selects which API endpoint the modal POSTs to. Everything else (UI flow, CSS, copy patterns) is identical.

## What stays the same across all massage shops

- 4-step modal UX (service → date → time → details → confirmation)
- Section structure: Hero → About → Services → Suites/Therapists → Sfeer → Visit → CTA → Footer
- Dark warm-neutral palette with single accent (amber for sensual; muted green / terracotta for therapeutic — change one CSS variable)
- NL-language copy patterns (eyebrow + display heading + sensory paragraph)
- `SHOP_HOURS` constant for opening hours (drives both display table and slot grid)
- Hero video rotator (atmospheric, no people)
- Asset drop-in pattern (READMEs in `videos/` and `images/`)

## What varies per shop

Already isolated in `js/main.js` `SHOP` constant + `SERVICES` map:

```js
const SHOP        = { name, phone, whatsapp, email, address, ... }
const SHOP_HOURS  = { 1: [10, 22], 2: [10, 22], ... }
const SERVICES    = { tantra: "Tantra", b2b: "Body 2 Body", ... }
const BOOKING_MODE = "request" | "cal"
```

For the skill: extract these into a single `config.js` and have a build script that templates `index.html` and `main.js` from it. Until then, find-and-replace per shop is fast enough.

## CSS tokens that matter per shop

In `css/style.css` `:root`:

```css
--bg, --bg-2, --surface     /* base dark tones — usually keep */
--bone, --bone-dim, --text  /* warm neutrals — usually keep */
--accent                    /* THE per-shop signature color */
--accent-2                  /* secondary accent (sparingly) */
--serif, --sans             /* font pair */
```

For a clean-vertical massage site, swap `--accent` from amber `#c9842a` to muted forest green `#5a7d5a` or terracotta `#a85a3a`. Everything else cascades.

## Skill layout (when you build it)

```
massage-template/
├── SKILL.md                  workflow + when-to-use, mirroring barbershop-template
├── template/                 the actual files to copy per spin-up
│   ├── index.html
│   ├── css/style.css
│   ├── js/main.js
│   ├── api/
│   │   ├── booking-request.js   (request variant)
│   │   ├── _cal.js              (cal variant — port from barbershop-080 once that repo is back)
│   │   ├── event-types.js
│   │   ├── slots.js
│   │   └── bookings.js
│   ├── images/README.txt
│   ├── videos/README.txt
│   ├── package.json
│   ├── vercel.json
│   ├── .env.example
│   └── .gitignore
├── examples/
│   ├── aurora-massages/      (this build, frozen as a reference)
│   └── chill-refill/         (clean-vertical example, future)
└── extract-config.md         instructions for the LLM on populating config per shop
```

## Lessons from the Aurora build

### What worked
- **Building fresh from the skill's documented file shape** (instead of cloning a missing repo) was actually faster than expected — the skill's section list + the booking-system spec gave me everything needed
- **Two design references → one synthesis** — Remedy for cleanness, Wayward for structure/copy. Document the exact extraction in the skill ("take X from A, take Y from B")
- **Request-booking flow as a feature, not a fallback** — for adult-vertical shops, manual confirmation = customer screening = pitch-worthy

### Pitfalls to encode in the skill

- **Verify the vertical before pitching** — the cold-outreach lead list ([../leads/out/massage.csv](../leads/out/massage.csv)) doesn't distinguish therapeutic vs erotic. Add a step: Google `"<name> Nijmegen"` to classify before sending a demo
- **Don't promise Cal.com to erotic shops** — ToS suspension risk; use the request-booking variant
- **Vercel AUP is a real risk for adult shops** — note it in the skill, with Hetzner+Caddy as the documented Plan B
- **Pricing is often hidden in the erotic vertical** — design for "Bel voor tarieven" by default; show prices only when the shop publishes them publicly
- **The 6-themed-suites pattern is Aurora-specific but transferable** — many small spas have signature rooms; replace "team/barbers" with "rooms/suites" for any massage shop with that USP
- **Hero video should never show people for the adult vertical** (legal/discretion); for therapeutic shops, hands + tables + steam is fine

### Open questions for the skill

- Should the request-booking variant store submissions to Vercel KV / a DB, or is fire-and-forget (email + Telegram) enough? Aurora chose fire-and-forget; revisit when a shop wants a "history" view
- Multi-language switcher (NL / EN / DE) — Aurora has international clientele; out of scope here but useful for a future shop
- Custom-fields per service in the booking modal (e.g. "couple's booking → second name field") — the JSON shape supports it; the UI doesn't yet
