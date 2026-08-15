import { Resend } from 'resend';
import type { ContactInput } from '@/lib/validateContact';

const resend = new Resend(import.meta.env.RESEND_API_KEY);

/**
 * Best-effort notification email. The contact submission is already
 * durably stored in Turso before this runs, so a failure here is
 * logged and swallowed rather than propagated — a Resend outage must
 * never cause a lost lead or a failed request for the visitor.
 */
export async function sendContactNotification(input: ContactInput): Promise<void> {
  const toEmail = import.meta.env.CONTACT_TO_EMAIL;

  try {
    const { error } = await resend.emails.send({
      from: 'Vantriq Website <notifications@vantriq.com>',
      to: toEmail,
      replyTo: input.email,
      subject: `New contact form submission from ${input.name}`,
      text: `Name: ${input.name}\nEmail: ${input.email}\n\nMessage:\n${input.message}`,
    });

    if (error) {
      // Resend returns API errors in the response body rather than throwing.
      console.error('Resend rejected the contact notification email:', {
        timestamp: new Date().toISOString(),
        to: toEmail,
        submitterEmail: input.email,
        error,
      });
    }
  } catch (error) {
    // Network/transport failure. The submission is already durably stored
    // in Turso before this runs (see api/contact.ts), so this is logged
    // and swallowed rather than surfaced to the visitor.
    console.error('Failed to send contact notification email:', {
      timestamp: new Date().toISOString(),
      to: toEmail,
      submitterEmail: input.email,
      error,
    });
  }
}
