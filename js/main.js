/* =====================================================
   AURORA — main.js
   Single-page interactivity:
   - sticky nav, mobile menu
   - hero video rotator (lazy-loads each clip in sequence)
   - background-image hydration for [data-img]
   - 4-step booking modal (request-booking variant)
   ===================================================== */

// ---------- CONFIG ---------------------------------------------------
// Everything shop-specific lives here so the future massage-template
// skill can extract this block into a single config.js.

const SHOP = {
  name: "Aurora",
  fullName: "Aurora Massages Nijmegen",
  phone: "+31243502776",
  phoneDisplay: "024 350 2776",
  whatsapp: "31243502776", // wa.me format — no plus, no spaces
  email: "balie@auroramassages.nl",
  address: "Heidebloemstraat 79, 6533 SM Nijmegen",
  timezone: "Europe/Amsterdam",
  language: "nl",
};

// 0 = Sun, 1 = Mon, ... 6 = Sat. [openHour, closeHour] in 24h local.
// Closed days are absent.
const SHOP_HOURS = {
  1: [10, 22],
  2: [10, 22],
  3: [10, 22],
  4: [10, 22],
  5: [10, 22],
  6: [10, 22], // Saturday actually 10:30 — booking grid starts at 11 (see SLOT_STEP)
};

// Slot step in minutes. With 60-min step we show :00 marks; 30-min step shows :00 and :30.
const SLOT_STEP = 30;

// Services catalog. Slug -> human label. Used in modal step 1 + summary.
const SERVICES = {
  tantra:  "Tantra",
  b2b:     "Body 2 Body",
  hamam:   "Hamam",
  extreme: "Extreme",
};

// Booking variant: "request" (this build) or "cal" (Cal.com proxy — see api/_cal.js)
const BOOKING_MODE = "request";

// Cache-bust version. Appended to image/video URLs to force re-download
// after we replace asset *contents* without changing the path. The
// vercel.json sets immutable cache headers on .jpg/.mp4, so without this
// edges + browsers serve stale copies. Bump when assets change.
const CACHE_BUST = "v=7";
const cb = (u) => (u && !u.includes("?") ? `${u}?${CACHE_BUST}` : u);

// API endpoint for request-booking variant
const BOOKING_ENDPOINT = "/api/booking-request";

// How far ahead to allow booking (days)
const BOOKING_HORIZON_DAYS = 60;

// ---------- DOM HELPERS ---------------------------------------------
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const on = (el, ev, fn, opts) => el && el.addEventListener(ev, fn, opts);
const fmtDate = (d) => d.toISOString().slice(0, 10);
const sameDay = (a, b) => a.toDateString() === b.toDateString();

// ---------- FOOTER YEAR ----------------------------------------------
$("#year") && ($("#year").textContent = new Date().getFullYear());

// ---------- NAV ------------------------------------------------------
const nav = $("#nav");
const onScroll = () => nav.classList.toggle("is-scrolled", window.scrollY > 8);
on(window, "scroll", onScroll, { passive: true });
onScroll();

const burger = $(".nav__burger");
on(burger, "click", () => {
  const open = nav.classList.toggle("is-open");
  burger.setAttribute("aria-expanded", open ? "true" : "false");
});
$$(".nav__links a").forEach((a) =>
  on(a, "click", () => {
    nav.classList.remove("is-open");
    burger.setAttribute("aria-expanded", "false");
  }),
);

// ---------- BACKGROUND-IMAGE HYDRATION -------------------------------
// Set backgroundImage directly — bulletproof. Some CSS interactions
// in the full page were swallowing the var(--img) approach.
// All URLs are cache-busted so replaced asset contents are picked up
// despite the immutable Cache-Control header in vercel.json.
$$("[data-img]").forEach((el) => {
  const src = el.getAttribute("data-img");
  if (!src) return;
  el.style.backgroundImage = `url("${cb(src)}")`;
  el.style.backgroundSize = "cover";
  el.style.backgroundPosition = "center";
  el.style.backgroundRepeat = "no-repeat";
});

// ---------- REVEAL ON SCROLL -----------------------------------------
// Soft fade-in for elements marked .reveal — premium feel without animation overload.
if ("IntersectionObserver" in window) {
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("is-in");
          io.unobserve(e.target);
        }
      });
    },
    { threshold: 0.1, rootMargin: "0px 0px -10% 0px" },
  );
  $$(".reveal").forEach((el) => io.observe(el));
} else {
  // Fallback: just show everything if IO isn't available
  $$(".reveal").forEach((el) => el.classList.add("is-in"));
}

// ---------- HERO VIDEO ROTATOR --------------------------------------
// Each clip plays through ONCE, then advances to the next.
// Robust pattern:
//   - All videos preload="metadata" so duration is known up-front.
//   - When a clip becomes active: set currentTime=0, call play().
//   - Advance trigger = ended event + a duration-based timeout fallback,
//     because ended doesn't fire reliably across all browsers/codecs.
const heroVideos = $$(".hero__video");
if (heroVideos.length) {
  heroVideos.forEach((v) => {
    const src = v.getAttribute("data-src");
    if (src) {
      v.src = cb(src);
      v.preload = "metadata";  // override any preload="none" so we know duration
      v.load();
    }
  });

  let idx = 0;
  let advanceTimer = null;

  const scheduleAdvanceFallback = (cur) => {
    clearTimeout(advanceTimer);
    // Optional cap: data-max-seconds="2" trims a clip to ≤ 2s before advancing.
    const cap = parseFloat(cur.getAttribute("data-max-seconds") || "0");
    const arm = () => {
      const natural = isFinite(cur.duration) && cur.duration > 0 ? cur.duration : 5;
      const target = cap > 0 ? Math.min(natural, cap) : natural;
      advanceTimer = setTimeout(next, (target + 0.15) * 1000);
    };
    if (cur.readyState >= 1 /* HAVE_METADATA */) arm();
    else cur.addEventListener("loadedmetadata", arm, { once: true });
  };

  const next = () => {
    clearTimeout(advanceTimer);
    const prev = heroVideos[idx];
    prev.classList.remove("is-active");
    prev.pause();

    idx = (idx + 1) % heroVideos.length;
    const cur = heroVideos[idx];
    cur.classList.add("is-active");
    try { cur.currentTime = 0; } catch (_) { /* may not be seekable yet */ }
    const p = cur.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
    scheduleAdvanceFallback(cur);
  };

  // Advance on natural end of any clip
  heroVideos.forEach((v) => on(v, "ended", next));
  // Arm initial fallback for the first clip too
  scheduleAdvanceFallback(heroVideos[0]);
}

// ---------- BOOKING MODAL --------------------------------------------
const modal = $("#book-modal");
const stepsList = $$(".book__steps li", modal);
const stepSections = $$(".book__step", modal);
const btnNext = $("#book-next");
const btnBack = $("#book-back");
const btnSubmit = $("#book-submit");

const state = {
  step: 1, // 1..4 then "confirm"
  service: null,
  date: null,    // Date object
  time: null,    // "HH:MM"
  formData: null,
};

function openModal(prefillService) {
  if (prefillService && SERVICES[prefillService]) {
    state.service = prefillService;
    state.step = 2;
  } else {
    state.step = 1;
  }
  state.date = state.time = null;
  modal.hidden = false;
  document.body.style.overflow = "hidden";
  renderStep();
}

function closeModal() {
  modal.hidden = true;
  document.body.style.overflow = "";
  // reset state so a reopen starts fresh
  state.step = 1; state.service = null; state.date = null; state.time = null;
  $$(".book__service.is-selected", modal).forEach((b) => b.classList.remove("is-selected"));
  $$(".book__slot.is-selected", modal).forEach((b) => b.classList.remove("is-selected"));
  $("#book-form").reset();
}

$$("[data-open-book]").forEach((b) =>
  on(b, "click", () => openModal(b.getAttribute("data-service"))),
);
$$("[data-close-book]").forEach((b) => on(b, "click", closeModal));
on(document, "keydown", (e) => {
  if (e.key === "Escape" && !modal.hidden) closeModal();
});

// Step 1: services
$$(".book__service").forEach((btn) =>
  on(btn, "click", () => {
    $$(".book__service").forEach((b) => b.classList.remove("is-selected"));
    btn.classList.add("is-selected");
    state.service = btn.getAttribute("data-service");
  }),
);

// Step 2: calendar
function renderCalendar(monthOffset = 0) {
  const cal = $("#book-calendar");
  cal.innerHTML = "";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const view = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
  const month = view.toLocaleDateString("nl-NL", { month: "long", year: "numeric" });

  // header
  const head = document.createElement("div");
  head.className = "book__cal-head";
  head.innerHTML = `
    <button class="book__cal-nav" data-cal-prev aria-label="Vorige maand">‹</button>
    <span class="book__cal-title">${month}</span>
    <button class="book__cal-nav" data-cal-next aria-label="Volgende maand">›</button>
  `;
  cal.appendChild(head);

  // dow row (NL, Mon-first)
  ["Ma","Di","Wo","Do","Vr","Za","Zo"].forEach((d) => {
    const e = document.createElement("div");
    e.className = "book__cal-dow"; e.textContent = d;
    cal.appendChild(e);
  });

  // pad to Monday-first (Sunday=0 -> 6, Monday=1 -> 0, ..., Saturday=6 -> 5)
  const firstDow = (view.getDay() + 6) % 7;
  for (let i = 0; i < firstDow; i++) {
    const blank = document.createElement("div");
    cal.appendChild(blank);
  }

  const lastDay = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  const horizon = new Date(today); horizon.setDate(horizon.getDate() + BOOKING_HORIZON_DAYS);

  for (let d = 1; d <= lastDay; d++) {
    const date = new Date(view.getFullYear(), view.getMonth(), d);
    const btn = document.createElement("button");
    btn.className = "book__day";
    btn.type = "button";
    btn.textContent = d;
    const isPast = date < today;
    const isClosed = !SHOP_HOURS[date.getDay()];
    const tooFar = date > horizon;
    if (isPast || isClosed || tooFar) btn.disabled = true;
    if (state.date && sameDay(date, state.date)) btn.classList.add("is-selected");
    on(btn, "click", () => {
      $$(".book__day.is-selected", cal).forEach((x) => x.classList.remove("is-selected"));
      btn.classList.add("is-selected");
      state.date = date;
    });
    cal.appendChild(btn);
  }

  on($("[data-cal-prev]", head), "click", () => {
    if (monthOffset > 0) renderCalendar(monthOffset - 1);
  });
  on($("[data-cal-next]", head), "click", () => renderCalendar(monthOffset + 1));
}

// Step 3: slots
function renderSlots() {
  const wrap = $("#book-slots");
  wrap.innerHTML = "";
  if (!state.date) {
    wrap.innerHTML = '<p class="book__hint">Kies eerst een datum.</p>';
    return;
  }
  const dow = state.date.getDay();
  const hours = SHOP_HOURS[dow];
  if (!hours) {
    wrap.innerHTML = '<p class="book__hint">Op deze dag zijn we gesloten.</p>';
    return;
  }
  const [start, end] = hours;
  // Saturday actually opens 10:30; bump to 11 for clean 30-min slots
  const startMin = (dow === 6 ? 11 : start) * 60;
  const endMin = end * 60;

  for (let m = startMin; m < endMin; m += SLOT_STEP) {
    const hh = String(Math.floor(m / 60)).padStart(2, "0");
    const mm = String(m % 60).padStart(2, "0");
    const t = `${hh}:${mm}`;
    const btn = document.createElement("button");
    btn.className = "book__slot"; btn.type = "button"; btn.textContent = t;
    if (state.time === t) btn.classList.add("is-selected");
    on(btn, "click", () => {
      $$(".book__slot.is-selected").forEach((x) => x.classList.remove("is-selected"));
      btn.classList.add("is-selected");
      state.time = t;
    });
    wrap.appendChild(btn);
  }
}

// Step navigation
function renderStep() {
  // pre-select service if openModal prefilled it
  if (state.service) {
    $$(".book__service").forEach((b) => {
      if (b.getAttribute("data-service") === state.service) b.classList.add("is-selected");
    });
  }

  // Update step indicators
  stepsList.forEach((li) => {
    const n = parseInt(li.getAttribute("data-step"), 10);
    li.classList.toggle("is-active", state.step === n);
    li.classList.toggle("is-done", state.step !== "confirm" && n < state.step);
  });

  // Show only active section
  stepSections.forEach((s) => {
    const k = s.getAttribute("data-step");
    s.classList.toggle("is-active", String(state.step) === String(k));
  });

  // Render dynamic content per step
  if (state.step === 2) renderCalendar();
  if (state.step === 3) renderSlots();

  // Footer button visibility
  const isConfirm = state.step === "confirm";
  btnBack.hidden = state.step === 1 || isConfirm;
  btnNext.hidden = isConfirm || state.step === 4;
  btnSubmit.hidden = state.step !== 4;
}

// Validate per step before advancing
function validateStep() {
  if (state.step === 1) {
    if (!state.service) { alert("Kies een massage."); return false; }
  } else if (state.step === 2) {
    if (!state.date) { alert("Kies een datum."); return false; }
  } else if (state.step === 3) {
    if (!state.time) { alert("Kies een tijd."); return false; }
  }
  return true;
}

on(btnNext, "click", () => {
  if (!validateStep()) return;
  state.step += 1;
  renderStep();
});
on(btnBack, "click", () => {
  if (state.step === "confirm") return;
  state.step -= 1;
  renderStep();
});

// Step 4 -> submit
on(btnSubmit, "click", async () => {
  const form = $("#book-form");
  if (!form.reportValidity()) return;

  const fd = new FormData(form);
  const payload = {
    service: state.service,
    serviceLabel: SERVICES[state.service],
    date: fmtDate(state.date),
    time: state.time,
    name: fd.get("name"),
    phone: fd.get("phone"),
    email: fd.get("email") || "",
    preference: fd.get("preference") || "",
    notes: fd.get("notes") || "",
    source: location.host,
  };
  state.formData = payload;

  btnSubmit.disabled = true;
  btnSubmit.textContent = "Verzenden…";

  let serverOk = false;
  try {
    const res = await fetch(BOOKING_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    serverOk = res.ok;
  } catch (_) {
    serverOk = false; // fall through to WhatsApp-only
  }

  // Always show confirmation + give WhatsApp deep link.
  // Even if the server failed, the WA link works as a fallback.
  showConfirm(payload, serverOk);

  btnSubmit.disabled = false;
  btnSubmit.textContent = "Verstuur reservering";
});

// ---------- MASSEUSE DETAIL MODAL ------------------------------------
// weekdays use JS Date.getDay() values: Sun=0, Mon=1, Tue=2, Wed=3,
// Thu=4, Fri=5, Sat=6. The roster on the homepage filters by these.
const MASSEUSES_DATA = {
  isabel: {
    name: "Isabel",
    photos: [
      "images/masseuses/isabel.jpg",
      "images/masseuses/isabel-2.jpg",
      "images/masseuses/isabel-3.jpg",
    ],
    tagline: "Slank · donkerblond · gevangen ogen",
    bio: "Een slanke verschijning met lange donkerblonde haren en een blik die langzaam binnenkomt. Beweegt nauwkeurig en kalm — een vaste favoriet voor wie van rust met spanning houdt.",
    specialties: ["Hot Sensual Tantra", "Lingam Massage", "Body to Body met warme olie"],
    days: "Maandag · Dinsdag · Donderdag · Zaterdag",
    weekdays: [1, 2, 4, 6],
  },
  paula: {
    name: "Paula",
    photos: [
      "images/masseuses/paula.jpg",
      "images/masseuses/paula-2.jpg",
    ],
    tagline: "Atletisch · exotisch · vloeiend Nederlands",
    bio: "Getinte huid en een atletisch postuur, met een exotische uitstraling. Spreekt vloeiend Nederlands en weet sterke handen met aandacht te combineren.",
    specialties: ["Hot Sensual Tantra", "Lingam Massage", "Luxe Arrangement 2"],
    days: "Woensdag · Vrijdag · soms zaterdag",
    weekdays: [3, 5, 6],
  },
  jessy: {
    name: "Jessy",
    photos: [
      "images/masseuses/jessy.jpg",
      "images/masseuses/jessy-2.jpg",
      "images/masseuses/jessy-3.jpg",
    ],
    tagline: "Latina · lang donkerblond · volle rondingen",
    bio: "Een echte Latina met lang donkerblond haar en volle rondingen. Speels, warm, volledig in haar element bij langere sensuele ritueelen.",
    specialties: [
      "Tantra Suprème", "Hot Sensual Tantra Savon", "Lingam Supérieur",
      "Luxe Arrangement 2", "Stoute Massage", "Body to Body met warme olie",
    ],
    days: "Dinsdag · Woensdag · Vrijdag · Zaterdag",
    weekdays: [2, 3, 5, 6],
  },
  rosalie: {
    name: "Rosalie",
    photos: [
      "images/masseuses/rosalie.jpg",
      "images/masseuses/rosalie-2.jpg",
    ],
    tagline: "Nederlandse blondine · ervaren · veelzijdig",
    bio: "Verleidelijke ervaren Nederlandse blondine met vrouwelijke rondingen. Rustig, gezellig, met humor — en een van onze meest veelzijdige masseuses op de kaart.",
    specialties: [
      "Hamam Happiness Tantra", "Tantra Suprème", "Nuru", "Lingam Massage",
      "Duo Massage", "Yoni Massage", "Russian Touch", "Blind Date",
      "Soft SM", "Extreme Massage", "Luxe Arrangementen",
    ],
    days: "Maandag · Dinsdag · Donderdag · Vrijdag",
    weekdays: [1, 2, 4, 5],
  },
  lisa: {
    name: "Lisa",
    photos: [
      "images/masseuses/lisa.jpg",
      "images/masseuses/lisa-2.jpg",
      "images/masseuses/lisa-3.jpg",
    ],
    tagline: "Spaanse brunette · stijlvol · betoverende glimlach",
    bio: "Slanke, sensuele Spaanse dame — een stijlvolle brunette met een glimlach die de kamer opent. Houdt van langzame, lange massages met veel huidcontact.",
    specialties: [
      "Thai Treatment", "Nuru", "Duo Massage", "Body to Body Savon",
      "Body to Body met warme olie", "Lingam Massage", "Hot Sensual Tantra",
      "Hamam Happiness Tantra",
    ],
    days: "Maandag · Woensdag · Donderdag · Vrijdag",
    weekdays: [1, 3, 4, 5],
  },
  natasja: {
    name: "Natasja",
    photos: [
      "images/masseuses/natasja.jpg",
      "images/masseuses/natasja-2.jpg",
    ],
    tagline: "Donkerblond · ervaren · professioneel",
    bio: "Mooie vrouw met halflang donkerblond haar en jaren ervaring in sensuele massage. Bekend om een rustige, professionele aanpak.",
    specialties: [
      "Hot Sensual Tantra", "Tantra Suprème", "Lingam Supérieur",
      "Nuru", "Duo Massage", "Russian Touch", "Body to Body", "Stoute Massage",
    ],
    days: "Dinsdag · Woensdag · Donderdag · Vrijdag · Zaterdag",
    weekdays: [2, 3, 4, 5, 6],
  },
  lara: {
    name: "Lara",
    photos: [
      "images/masseuses/lara.jpg",
      "images/masseuses/lara-2.jpg",
    ],
    tagline: "Zuid-Amerikaans · vrouwelijke rondingen · vrolijk",
    bio: "Exotische Zuid-Amerikaanse dame met lange donkere haren, vrouwelijke rondingen en een vrolijke uitstraling. Een echte vlinder in de kamer.",
    specialties: [
      "Body to Body (olie en savon)", "Lingam Massage", "Hot Sensual Tantra",
      "Nuru", "Thai Treatment", "Tantra Suprème", "Extreme Massage",
      "Prostaat Tantra", "Stoute Massage",
    ],
    days: "Dinsdag · Woensdag · Donderdag",
    weekdays: [2, 3, 4],
  },
  anna: {
    name: "Anna",
    photos: [
      "images/masseuses/anna.jpg",
      "images/masseuses/anna-2.jpg",
      "images/masseuses/anna-3.jpg",
    ],
    tagline: "Nederlands · natuurlijke rondingen · cup D",
    bio: "Een intrigerende Nederlandse dame met natuurlijke rondingen, cup D. Warm, ontspannen en heerlijk aanwezig in elke aanraking.",
    specialties: [
      "Lingam Massage", "Lingam Supérieur", "Tantra Suprème",
      "Nuru", "Hot Sensual Tantra", "Body to Body met warme olie",
      "Duo Massage", "Koppel-arrangementen",
    ],
    days: "Maandag · Donderdag · Vrijdag · Zaterdag",
    weekdays: [1, 4, 5, 6],
  },
  dehlia: {
    name: "Dehlia",
    photos: [
      "images/masseuses/dehlia.jpg",
      "images/masseuses/dehlia-2.jpg",
      "images/masseuses/dehlia-3.jpg",
      "images/masseuses/dehlia-4.jpg",
    ],
    tagline: "Donkere krullen · blauwe ogen · enthousiast",
    bio: "Enthousiaste, vrolijke en lichtjes mysterieuze schoonheid met donkere krullen en blauwe ogen. Eén van onze breedst opgeleide masseuses.",
    specialties: [
      "Hamam Happiness Tantra", "Tantra Suprème", "Lingam Supérieur",
      "Summer Shower", "Thai Treatment", "Blind Date", "Extreme Massage",
      "Nuru", "Russian Touch", "Yoni Massage", "Soft SM", "Prostaat Tantra",
      "Luxe Arrangementen",
    ],
    days: "Maandag · Woensdag · Vrijdag",
    weekdays: [1, 3, 5],
  },
  jacky: {
    name: "Jacky",
    photos: [
      "images/masseuses/jacky.jpg",
    ],
    tagline: "Zuid-Europees · slank · Nederlandstalig",
    bio: "Mooie lieve slanke brunette van Zuid-Europese afkomst. Spreekt Nederlands en heeft jarenlange massage-ervaring in een verfijnde, sensuele stijl.",
    specialties: [
      "Hot Sensual Tantra", "Tantra Suprème", "Nuru", "Lingam Supérieur",
      "Duo", "Blind Date", "Thai Treatment", "Extreme Massage",
      "Prostaat Tantra", "Body to Body", "Luxe Arrangementen", "Stoute Massage",
    ],
    days: "Woensdag · Vrijdag (en op afspraak)",
    weekdays: [3, 5],
  },
  "jenna-rose": {
    name: "Jenna Rose",
    photos: [
      "images/masseuses/jenna-rose.jpg",
      "images/masseuses/jenna-rose-2.jpg",
      "images/masseuses/jenna-rose-3.jpg",
      "images/masseuses/jenna-rose-4.jpg",
      "images/masseuses/jenna-rose-5.jpg",
    ],
    tagline: "Lang · slank · Nederlands · 'Girl next door'",
    bio: "Lang, slank en Nederlands — de 'Girl next door' met ondeugende ogen en een passie voor erotische massage.",
    specialties: ["Lingam Massage", "Hot Sensual Tantra"],
    days: "Dinsdag · Vrijdag",
    weekdays: [2, 5],
  },
  sera: {
    name: "Sera",
    photos: [
      "images/masseuses/sera.jpg",
    ],
    tagline: "Lang · slank · Nederlands · lang blond haar",
    bio: "Lange slanke Nederlandse dame met lang blond haar. Werkt graag in stilte, met aandacht voor adem en ritme.",
    specialties: [
      "Yoni", "Lingam", "Tantra Suprème", "Hamam", "Nuru",
      "Body to Body Savon", "Hot Sensual Tantra", "Soft SM",
      "Extreme Massage", "Prostaat Tantra", "Duo Massage", "Luxe Arrangementen",
    ],
    days: "Maandag · Donderdag · Zaterdag",
    weekdays: [1, 4, 6],
  },
  wendy: {
    name: "Wendy",
    photos: [
      "images/masseuses/wendy.jpg",
      "images/masseuses/wendy-2.jpg",
      "images/masseuses/wendy-3.jpg",
    ],
    tagline: "Slanke knappe blondine · subtiel · attent",
    bio: "Slanke knappe blondine met massages die professioneel, subtiel en attent zijn. Houdt van het opbouwen van spanning in stilte.",
    specialties: [
      "Russian Touch", "Nuru", "Tantra Suprème",
      "Hot Sensual Tantra", "Lingam Supérieur", "Lingam Massage",
    ],
    days: "Maandag · Donderdag · Zaterdag",
    weekdays: [1, 4, 6],
  },
  alex: {
    name: "Alex",
    photos: [
      "images/masseuses/alex.jpg",
    ],
    tagline: "Mannelijke masseur · ervaren · rustig",
    bio: "Een rustige mannelijke masseur met uitgebreide massage-ervaring. Werkt op afspraak en is met name geliefd bij dames en koppels.",
    specialties: [
      "Lingam Massage", "Lingam Supérieur", "Yoni Massage",
      "Tantra Suprème", "Hot Sensual Tantra", "Prostaat Tantra",
      "Body to Body met warme olie", "Soft SM", "Luxe Arrangementen (ook koppels)",
    ],
    days: "Maandag t/m zaterdag · alleen op afspraak",
    weekdays: [1, 2, 3, 4, 5, 6],
  },
};

const masseuseModal = $("#masseuse-modal");
if (masseuseModal) {
  const mPhoto       = $("#masseuse-modal-photo");
  const mThumbs      = $("#masseuse-modal-thumbs");
  const mCounter     = $("#masseuse-modal-counter");
  const mPrev        = $("#masseuse-modal-prev");
  const mNext        = $("#masseuse-modal-next");
  const mName        = $("#masseuse-modal-name");
  const mTagline     = $("#masseuse-modal-tagline");
  const mBio         = $("#masseuse-modal-bio");
  const mSpecialties = $("#masseuse-modal-specialties");
  const mDays        = $("#masseuse-modal-days");
  const mBookBtn     = $("#masseuse-modal-book");

  let galleryPhotos = [];
  let galleryIdx = 0;

  function showPhoto(i) {
    if (!galleryPhotos.length) return;
    galleryIdx = (i + galleryPhotos.length) % galleryPhotos.length;
    mPhoto.style.backgroundImage = `url("${cb(galleryPhotos[galleryIdx])}")`;
    if (mCounter) mCounter.textContent = `${galleryIdx + 1} / ${galleryPhotos.length}`;
    if (mThumbs) {
      $$(".masseuse-modal__thumb", mThumbs).forEach((t, n) =>
        t.classList.toggle("is-active", n === galleryIdx),
      );
    }
    const single = galleryPhotos.length <= 1;
    if (mPrev) mPrev.hidden = single;
    if (mNext) mNext.hidden = single;
    if (mCounter) mCounter.hidden = single;
  }

  function openMasseuse(slug) {
    const m = MASSEUSES_DATA[slug];
    if (!m) return;
    galleryPhotos = m.photos && m.photos.length ? m.photos : [m.photo].filter(Boolean);
    galleryIdx = 0;

    mName.textContent = m.name;
    mTagline.textContent = m.tagline || "";
    mBio.textContent = m.bio || "";
    mSpecialties.innerHTML = "";
    (m.specialties || []).forEach((s) => {
      const li = document.createElement("li");
      li.textContent = s;
      mSpecialties.appendChild(li);
    });
    mDays.textContent = m.days || "";
    mBookBtn.dataset.preference = m.name;

    if (mThumbs) {
      mThumbs.innerHTML = "";
      mThumbs.hidden = galleryPhotos.length <= 1;
      galleryPhotos.forEach((src, i) => {
        const t = document.createElement("button");
        t.type = "button";
        t.className = "masseuse-modal__thumb";
        t.style.backgroundImage = `url("${cb(src)}")`;
        t.setAttribute("aria-label", `Foto ${i + 1}`);
        on(t, "click", () => showPhoto(i));
        mThumbs.appendChild(t);
      });
    }
    showPhoto(0);

    masseuseModal.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeMasseuse() {
    masseuseModal.hidden = true;
    document.body.style.overflow = "";
  }

  $$(".masseuse-card[data-masseuse]").forEach((btn) =>
    on(btn, "click", () => openMasseuse(btn.getAttribute("data-masseuse"))),
  );
  $$("[data-close-masseuse]").forEach((b) => on(b, "click", closeMasseuse));
  on(mPrev, "click", () => showPhoto(galleryIdx - 1));
  on(mNext, "click", () => showPhoto(galleryIdx + 1));
  on(document, "keydown", (e) => {
    if (masseuseModal.hidden) return;
    if (e.key === "Escape") closeMasseuse();
    else if (e.key === "ArrowLeft") showPhoto(galleryIdx - 1);
    else if (e.key === "ArrowRight") showPhoto(galleryIdx + 1);
  });

  // "Reserveer met deze masseuse" — close detail, open booking modal with name pre-filled
  on(mBookBtn, "click", () => {
    const pref = mBookBtn.dataset.preference || "";
    closeMasseuse();
    if (typeof openModal === "function") openModal();
    setTimeout(() => {
      const prefField = document.querySelector('#book-form input[name="preference"]');
      if (prefField) prefField.value = pref;
    }, 0);
  });
}

// ---------- AMBIENT AUDIO (homepage spa loop) ------------------------
// Soft background audio. Off by default — browsers block autoplay-with-
// sound until a user gesture, and we don't want to surprise visitors.
// Click toggles; preference persists in localStorage so returning
// visitors hear it again (after their first interaction on the new visit
// the saved-on state will resume).
(function ambientAudio() {
  const btn   = $("#ambient-toggle");
  const audio = $("#ambient-audio");
  if (!btn || !audio) return;

  audio.volume = 0.28; // calm background level

  const STORAGE_KEY = "aurora-ambient";
  let unlocked = false; // becomes true after the first successful play()

  function setPlaying(playing, persist = true) {
    if (playing) {
      const p = audio.play();
      if (p && typeof p.then === "function") {
        p.then(() => {
          unlocked = true;
          btn.classList.add("is-playing");
          btn.setAttribute("aria-pressed", "true");
          if (persist) localStorage.setItem(STORAGE_KEY, "on");
        }).catch(() => {
          // autoplay blocked or audio file missing — stay silent
          btn.classList.remove("is-playing");
          btn.setAttribute("aria-pressed", "false");
        });
      }
    } else {
      audio.pause();
      btn.classList.remove("is-playing");
      btn.setAttribute("aria-pressed", "false");
      if (persist) localStorage.removeItem(STORAGE_KEY);
    }
  }

  on(btn, "click", () => setPlaying(!btn.classList.contains("is-playing")));

  // If the visitor previously enabled it, try to resume. The first call
  // may be silently rejected by the browser; the next user gesture will
  // succeed because setPlaying() runs again on click.
  if (localStorage.getItem(STORAGE_KEY) === "on") {
    setPlaying(true, false);
    // Fall-back: resume on first user gesture if blocked
    const resume = () => {
      if (!unlocked && localStorage.getItem(STORAGE_KEY) === "on") {
        setPlaying(true, false);
      }
      document.removeEventListener("click", resume);
      document.removeEventListener("scroll", resume);
    };
    document.addEventListener("click", resume, { once: true });
    document.addEventListener("scroll", resume, { once: true, passive: true });
  }
})();

// ---------- HOMEPAGE: VANDAAG / MORGEN ROSTER ------------------------
// Renders into [data-roster] elements based on each masseuse's weekdays.
// We don't claim a hard "today" — bezetting wisselt — but a daily filter
// gives a representative list and matches what auroramassages.nl shows.
(function renderRoster() {
  const slots = $$("[data-roster]");
  if (!slots.length) return;

  const NL_WEEKDAY = ["zondag","maandag","dinsdag","woensdag","donderdag","vrijdag","zaterdag"];
  const NL_MONTH   = ["januari","februari","maart","april","mei","juni","juli","augustus","september","oktober","november","december"];

  const today = new Date();
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

  function rosterFor(date) {
    const dow = date.getDay();
    const entries = Object.entries(MASSEUSES_DATA)
      .filter(([, m]) => Array.isArray(m.weekdays) && m.weekdays.includes(dow))
      .map(([slug, m]) => ({ slug, m }));
    // Deterministic shuffle by date so the order is stable but rotates daily.
    const seed = date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
    let s = seed;
    const rand = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    for (let i = entries.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [entries[i], entries[j]] = [entries[j], entries[i]];
    }
    return entries.slice(0, 8);
  }

  function dateLabel(d) {
    return `${NL_WEEKDAY[d.getDay()]} ${d.getDate()} ${NL_MONTH[d.getMonth()]}`;
  }

  slots.forEach((slot) => {
    const which = slot.getAttribute("data-roster"); // "today" | "tomorrow"
    const date  = which === "tomorrow" ? tomorrow : today;
    const list  = rosterFor(date);
    slot.innerHTML = "";

    const dateEl = slot.previousElementSibling
      && slot.previousElementSibling.classList.contains("roster__date")
      ? slot.previousElementSibling : null;
    if (dateEl) dateEl.textContent = dateLabel(date);

    if (!list.length) {
      const p = document.createElement("p");
      p.className = "roster__empty";
      p.textContent = "Bel ons voor de actuele bezetting.";
      slot.appendChild(p);
      return;
    }

    list.forEach(({ slug, m }) => {
      const card = document.createElement("a");
      card.className = "roster__card";
      card.href = `masseuses.html#${slug}`;
      card.innerHTML = `
        <span class="roster__photo" style="background-image:url('${cb((m.photos && m.photos[0]) || m.photo)}')"></span>
        <span class="roster__name">${m.name}</span>
      `;
      slot.appendChild(card);
    });
  });
})();

function showConfirm(p, serverOk) {
  state.step = "confirm";
  renderStep();

  const dateLabel = state.date.toLocaleDateString("nl-NL", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  $("#book-summary").textContent =
    `${p.serviceLabel} · ${dateLabel} · ${p.time}`;

  // Build pre-filled WhatsApp message for the customer to send
  const lines = [
    "Reservering Aurora Massages",
    `Massage: ${p.serviceLabel}`,
    `Datum: ${dateLabel}`,
    `Tijd: ${p.time}`,
    `Naam: ${p.name}`,
    `Telefoon: ${p.phone}`,
  ];
  if (p.preference) lines.push(`Voorkeur: ${p.preference}`);
  if (p.notes) lines.push(`Wensen: ${p.notes}`);
  const waText = encodeURIComponent(lines.join("\n"));
  $("#book-wa").href = `https://wa.me/${SHOP.whatsapp}?text=${waText}`;

  // If the server didn't accept the request, hint that (but don't alarm)
  if (!serverOk) {
    const hint = document.querySelector(".book__confirm .book__hint");
    if (hint) {
      hint.innerHTML =
        `Onze server bevestiging is niet doorgekomen — gebruik de WhatsApp-knop hierboven, of bel ` +
        `<a href="tel:${SHOP.phone}">${SHOP.phoneDisplay}</a>.`;
    }
  }
}
