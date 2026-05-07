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
// Elements with data-img get their image as a CSS custom property `--img`,
// which the stylesheet uses via `background-image: var(--img)`.
// One unified mechanism for suite rows, sfeer tiles, anything else.
$$("[data-img]").forEach((el) => {
  const src = el.getAttribute("data-img");
  if (!src) return;
  el.style.setProperty("--img", `url("${src}")`);
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
const heroVideos = $$(".hero__video");
if (heroVideos.length) {
  // Lazy-load each clip's source (so the page doesn't pull all of them upfront)
  heroVideos.forEach((v) => {
    const src = v.getAttribute("data-src");
    if (src) {
      v.src = src;
      v.load();
    }
  });

  let idx = 0;
  // Switch to next when current ends (or every 8s as fallback)
  const next = () => {
    heroVideos[idx].classList.remove("is-active");
    heroVideos[idx].pause();
    idx = (idx + 1) % heroVideos.length;
    const cur = heroVideos[idx];
    cur.classList.add("is-active");
    cur.currentTime = 0;
    cur.play().catch(() => { /* ignore autoplay rejections */ });
  };
  heroVideos.forEach((v) => on(v, "ended", next));
  setInterval(next, 8000);
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
