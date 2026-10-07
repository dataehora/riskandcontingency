// Contact page: validates the form and posts it to the Pages Function at
// /api/contact (functions/api/contact.js), which emails it. Same red
// "missing" highlighting as the Risk Register form.
import { t, getLang } from "../i18n/i18n.js";

const CONTACT_EMAIL = "contact@riskandcontingency.com";
const EMAIL_PATTERN = /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[^\s@<>()",;]+$/;
const REQUIRED = ["enquiryType", "region", "firstName", "lastName", "email", "message"];

const form = document.querySelector("[data-contact-form]");
const errorBox = document.querySelector("[data-contact-error]");
const submitBtn = document.querySelector("[data-contact-submit]");
const success = document.querySelector("[data-contact-success]");
const againBtn = document.querySelector("[data-contact-again]");

let attempted = false;

function field(name) {
  return form.elements[name];
}

// Returns the list of problems; paints missing/invalid fields red once the
// user has tried to submit (not before, so an empty form isn't all red).
function validate() {
  const problems = [];
  for (const name of REQUIRED) {
    const el = field(name);
    const missing = !el.value.trim();
    el.classList.toggle("is-missing", attempted && missing);
    if (missing) problems.push("missing");
  }
  const email = field("email");
  const badEmail = email.value.trim() && !EMAIL_PATTERN.test(email.value.trim());
  if (badEmail) {
    email.classList.toggle("is-missing", attempted);
    problems.push("email");
  }
  if (!field("consent").checked) problems.push("consent");
  return problems;
}

function showError(html) {
  errorBox.innerHTML = html;
  errorBox.hidden = !html;
}

function problemsMessage(problems) {
  const lines = [];
  if (problems.includes("missing")) lines.push(t("contact.err.missing"));
  if (problems.includes("email")) lines.push(t("contact.err.email"));
  if (problems.includes("consent")) lines.push(t("contact.err.consent"));
  return lines.map((l) => `<p>${l}</p>`).join("");
}

function fallbackMessage(key) {
  return `<p>${t(key, { email: `<a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>` })}</p>`;
}

form.addEventListener("input", () => {
  if (attempted) validate();
});
form.addEventListener("change", () => {
  if (attempted) validate();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  attempted = true;
  const problems = validate();
  if (problems.length) {
    showError(problemsMessage(problems));
    form.querySelector(".is-missing")?.focus();
    return;
  }
  showError("");

  const payload = {
    enquiryType: field("enquiryType").value,
    region: field("region").value,
    firstName: field("firstName").value.trim(),
    lastName: field("lastName").value.trim(),
    email: field("email").value.trim(),
    phone: field("phone").value.trim(),
    message: field("message").value.trim(),
    website: field("website").value,
    consent: field("consent").checked,
    lang: getLang(),
  };

  submitBtn.disabled = true;
  submitBtn.textContent = t("contact.sending");
  try {
    const res = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await res.json().catch(() => null);
    if (res.ok && result?.ok) {
      form.reset();
      attempted = false;
      form.hidden = true;
      success.hidden = false;
      success.focus();
      return;
    }
    showError(
      fallbackMessage(result?.error === "invalid" ? "contact.err.invalid" : "contact.err.send")
    );
  } catch {
    showError(fallbackMessage("contact.err.send"));
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = t("contact.submit");
  }
});

againBtn.addEventListener("click", () => {
  success.hidden = true;
  form.hidden = false;
  field("enquiryType").focus();
});
