const form = document.getElementById('contact-form');
const statusEl = document.getElementById('form-status');

// Time trap: this script runs shortly after the page loads, so this is
// effectively "when the form became available to fill in". Bots that
// fetch the page and POST immediately produce a tiny elapsed time; the
// server rejects anything under its minimum (see src/lib/validateContact.ts).
const formRenderedAt = Date.now();

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!statusEl) return;

  const submitButton = form.querySelector('button[type="submit"]');
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  payload.elapsed_ms = Date.now() - formRenderedAt;

  submitButton?.setAttribute('disabled', 'true');
  statusEl.classList.remove('hidden', 'text-feedback-error', 'text-feedback-success');
  statusEl.textContent = 'Sending…';

  try {
    const response = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (response.ok) {
      statusEl.classList.add('text-feedback-success');
      statusEl.textContent = "Thanks — we've received your message and will be in touch soon.";
      form.reset();
    } else {
      statusEl.classList.add('text-feedback-error');
      statusEl.textContent = result.error || 'Something went wrong. Please try again.';
    }
  } catch {
    statusEl.classList.add('text-feedback-error');
    statusEl.textContent = 'Something went wrong. Please check your connection and try again.';
  } finally {
    submitButton?.removeAttribute('disabled');
  }
});
