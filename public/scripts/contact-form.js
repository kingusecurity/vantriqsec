const form = document.getElementById('contact-form');
const statusEl = document.getElementById('form-status');

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!statusEl) return;

  const submitButton = form.querySelector('button[type="submit"]');
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());

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
