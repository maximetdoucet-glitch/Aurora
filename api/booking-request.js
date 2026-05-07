// Vercel serverless function — request-booking variant.
//
// Receives a booking request from the modal, forwards it to the shop owner
// via email (Resend) and/or Telegram. Returns 200 even if no notifier is
// configured — the frontend falls back to a customer-driven WhatsApp link
// (built client-side, no API key needed).
//
// This is the erotic-vertical alternative to api/_cal.js + api/bookings.js.
// Cal.com's AUP prohibits adult services, so we do NOT use it for shops
// that fall in this category.
//
// Env vars (all optional, but at least one notifier is recommended):
//   RESEND_API_KEY        — Resend API key for email notifications
//   NOTIFY_EMAIL_TO       — shop owner email (comma-separated for multiple)
//   NOTIFY_EMAIL_FROM     — must be a verified sender on Resend
//   TELEGRAM_BOT_TOKEN    — for Telegram notifications
//   TELEGRAM_CHAT_ID      — shop owner Telegram chat id

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Vercel parses JSON automatically when content-type is application/json
  const body = req.body || {};

  // ---------- validation ----------
  const required = ["service", "serviceLabel", "date", "time", "name", "phone"];
  const missing = required.filter((k) => !body[k] || String(body[k]).trim() === "");
  if (missing.length) {
    return res.status(400).json({ error: "Missing fields", fields: missing });
  }

  // light sanitize / cap lengths to prevent abuse
  const cap = (v, n) => String(v || "").slice(0, n);
  const data = {
    service:       cap(body.service, 60),
    serviceLabel:  cap(body.serviceLabel, 80),
    date:          cap(body.date, 12),
    time:          cap(body.time, 8),
    name:          cap(body.name, 120),
    phone:         cap(body.phone, 40),
    email:         cap(body.email, 200),
    preference:    cap(body.preference, 200),
    notes:         cap(body.notes, 800),
    source:        cap(body.source, 120),
    receivedAt:    new Date().toISOString(),
    ip:            (req.headers["x-forwarded-for"] || "").split(",")[0].trim(),
    userAgent:     cap(req.headers["user-agent"] || "", 200),
  };

  // ---------- compose human-readable summary ----------
  const lines = [
    `Nieuwe reserveringsaanvraag — ${data.serviceLabel}`,
    ``,
    `Datum:       ${data.date}`,
    `Tijd:        ${data.time}`,
    `Naam:        ${data.name}`,
    `Telefoon:    ${data.phone}`,
    data.email      ? `E-mail:      ${data.email}` : null,
    data.preference ? `Voorkeur:    ${data.preference}` : null,
    data.notes      ? `Wensen:      ${data.notes}` : null,
    ``,
    `Bron: ${data.source}`,
    `Ontvangen: ${data.receivedAt}`,
  ].filter(Boolean).join("\n");

  // ---------- fan out to notifiers (best-effort) ----------
  const results = await Promise.allSettled([
    sendEmail(data, lines),
    sendTelegram(data, lines),
  ]);

  const ok = results.some((r) => r.status === "fulfilled" && r.value === true);
  const errors = results
    .filter((r) => r.status === "rejected" || r.value !== true)
    .map((r) => r.status === "rejected" ? String(r.reason) : "skipped");

  // We always 200 if at least one notifier worked. If none worked but request
  // was valid, we still 202 (accepted) — the WhatsApp fallback in the UI will
  // kick in and the customer can complete via WA.
  if (ok) return res.status(200).json({ ok: true });
  return res.status(202).json({ ok: false, fallback: "whatsapp", errors });
}

// ---------- Email via Resend ----------
async function sendEmail(data, text) {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.NOTIFY_EMAIL_TO;
  const from = process.env.NOTIFY_EMAIL_FROM;
  if (!key || !to || !from) return false;

  const subject = `Reservering · ${data.serviceLabel} · ${data.date} ${data.time} · ${data.name}`;

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: to.split(",").map((s) => s.trim()).filter(Boolean),
      subject,
      text,
      reply_to: data.email || undefined,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text().catch(() => "");
    throw new Error(`Resend ${resp.status}: ${err.slice(0, 200)}`);
  }
  return true;
}

// ---------- Telegram bot ----------
async function sendTelegram(data, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return false;

  const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chat,
      text,
      disable_web_page_preview: true,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text().catch(() => "");
    throw new Error(`Telegram ${resp.status}: ${err.slice(0, 200)}`);
  }
  return true;
}
