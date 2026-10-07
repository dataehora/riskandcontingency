// Cloudflare Pages Function: POST /api/contact — the Contact page form.
//
// The only server-side code on the site. It validates the form and sends
// it as an email through Cloudflare Email Service's REST API. Sending to a
// *verified destination address* of the account is free on every plan
// (no Workers Paid plan needed), so CONTACT_TO must be an address verified
// under Email Routing → Destination addresses.
//
// Environment variables (Pages project → Settings → Variables and
// Secrets — none of them live in the repo):
//   CF_ACCOUNT_ID      Cloudflare account id
//   CF_EMAIL_TOKEN     API token with "Email Sending: Edit" (as a Secret)
//   CONTACT_TO         verified destination address that receives messages
//   CONTACT_FROM       sender on riskandcontingency.com
//                      (default noreply@riskandcontingency.com)
//
// Nothing is stored: the message goes straight into the email.

const ENQUIRY_TYPES = [
  "General enquiry",
  "Using the tool",
  "Bug report",
  "Feature request",
  "Consulting and training",
  "Privacy enquiry",
  "Media",
];

const REGIONS = [
  "United Kingdom",
  "Europe",
  "USA",
  "Canada",
  "Latin America",
  "Middle East",
  "Africa",
  "Asia",
  "Australia and New Zealand",
];

const LIMITS = { firstName: 100, lastName: 100, email: 200, phone: 40, message: 5000 };
const EMAIL_PATTERN = /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[^\s@<>()",;]+$/;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function clean(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

// Header-safe single line (no CR/LF injection into the subject).
function oneLine(value) {
  return value.replace(/[\r\n]+/g, " ");
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function onRequestPost({ request, env }) {
  let data;
  try {
    data = await request.json();
  } catch {
    return json({ ok: false, error: "invalid" }, 400);
  }

  // Honeypot filled in: pretend it worked, send nothing.
  if (clean(data.website, 200)) return json({ ok: true });

  const form = {
    enquiryType: clean(data.enquiryType, 60),
    region: clean(data.region, 60),
    firstName: oneLine(clean(data.firstName, LIMITS.firstName)),
    lastName: oneLine(clean(data.lastName, LIMITS.lastName)),
    email: clean(data.email, LIMITS.email),
    phone: oneLine(clean(data.phone, LIMITS.phone)),
    message: clean(data.message, LIMITS.message),
    lang: clean(data.lang, 5),
  };

  const invalid =
    !ENQUIRY_TYPES.includes(form.enquiryType) ||
    !REGIONS.includes(form.region) ||
    !form.firstName ||
    !form.lastName ||
    !EMAIL_PATTERN.test(form.email) ||
    !form.message ||
    data.consent !== true;
  if (invalid) return json({ ok: false, error: "invalid" }, 400);

  if (!env.CF_ACCOUNT_ID || !env.CF_EMAIL_TOKEN || !env.CONTACT_TO) {
    return json({ ok: false, error: "not-configured" }, 503);
  }

  const name = `${form.firstName} ${form.lastName}`;
  const rows = [
    ["Enquiry type", form.enquiryType],
    ["Region", form.region],
    ["Name", name],
    ["Email", form.email],
    ["Phone", form.phone || "—"],
    ["Site language", form.lang || "—"],
  ];
  const text =
    rows.map(([k, v]) => `${k}: ${v}`).join("\n") +
    `\n\nMessage:\n${form.message}\n\n— Sent from the contact form on riskandcontingency.com`;
  const html =
    `<table cellpadding="4">${rows
      .map(([k, v]) => `<tr><th align="left">${k}</th><td>${escapeHtml(v)}</td></tr>`)
      .join("")}</table>` +
    `<p><strong>Message:</strong></p><p style="white-space:pre-wrap">${escapeHtml(form.message)}</p>` +
    `<p style="color:#888">Sent from the contact form on riskandcontingency.com</p>`;

  const message = {
    to: env.CONTACT_TO,
    from: env.CONTACT_FROM || "noreply@riskandcontingency.com",
    replyTo: form.email,
    subject: oneLine(`[Contact] ${form.enquiryType} — ${name}`),
    text,
    html,
  };

  const send = (body) =>
    fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/email/sending/send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.CF_EMAIL_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

  try {
    let res = await send(message);
    // If the API rejects the request schema, retry once without replyTo
    // (the sender's address is in the body anyway).
    if (res.status === 400) {
      const { replyTo, ...withoutReplyTo } = message;
      res = await send(withoutReplyTo);
    }
    const result = await res.json().catch(() => null);
    if (!res.ok || !result?.success) {
      console.error("contact: send failed", res.status, JSON.stringify(result?.errors ?? null));
      return json({ ok: false, error: "send-failed" }, 502);
    }
    return json({ ok: true });
  } catch (err) {
    console.error("contact: send threw", err);
    return json({ ok: false, error: "send-failed" }, 502);
  }
}

export function onRequest() {
  return json({ ok: false, error: "method-not-allowed" }, 405);
}
