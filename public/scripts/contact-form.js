const form = document.getElementById('contact-form');
const statusEl = document.getElementById('form-status');
const tokenField = document.getElementById('contact_token');

// Server-signed time-trap token: fetched once on load, verified
// server-side on submit (see src/lib/contactToken.ts). Awaited before
// reading form data on submit so a fast human doesn't race the fetch.
const tokenPromise = fetch('/api/contact-token')
  .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`token fetch failed: ${res.status}`))))
  .then((data) => {
    if (tokenField) tokenField.value = data.token;
    return data.token;
  })
  .catch((error) => {
    console.error('Failed to fetch contact token:', error);
    return null;
  });

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!statusEl) return;

  const submitButton = form.querySelector('button[type="submit"]');
  submitButton?.setAttribute('disabled', 'true');
  statusEl.classList.remove('hidden', 'text-feedback-error', 'text-feedback-success');
  statusEl.textContent = 'Sending…';

  await tokenPromise;

  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());

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
