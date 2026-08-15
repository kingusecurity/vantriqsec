import { z } from 'zod';

// Minimum time between the form rendering and the submission arriving,
// in milliseconds. Bots that fetch the page and POST immediately land
// well under this; a human reading and filling three fields doesn't.
// Measured entirely client-side (see public/scripts/contact-form.js) so
// there's no client/server clock-skew to account for.
const MIN_SUBMIT_MS = 2000;

export const contactSchema = z.object({
  name: z.string().trim().min(2, 'Name is too short').max(120),
  email: z.email('Enter a valid email address').trim().max(200),
  message: z.string().trim().min(10, 'Message is too short').max(4000),
  // Honeypot: real visitors never fill this hidden field in.
  company_website: z.string().max(0, 'Spam detected').optional().default(''),
  // Time trap: rejects submissions that arrive suspiciously fast.
  elapsed_ms: z.coerce.number().min(MIN_SUBMIT_MS, 'Submitted too quickly'),
});

export type ContactInput = z.infer<typeof contactSchema>;
