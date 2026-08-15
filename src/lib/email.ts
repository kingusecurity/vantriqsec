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
    await resend.emails.send({
      from: 'Sipar Security Website <notifications@siparsecurity.com>',
      to: toEmail,
      replyTo: input.email,
      subject: `New contact form submission from ${input.name}`,
      text: `Name: ${input.name}\nEmail: ${input.email}\n\nMessage:\n${input.message}`,
    });
  } catch (error) {
    console.error('Failed to send contact notification email:', error);
  }
}
