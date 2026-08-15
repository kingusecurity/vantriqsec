import { z } from 'zod';

export const contactSchema = z.object({
  name: z.string().trim().min(2, 'Name is too short').max(120),
  email: z.email('Enter a valid email address').trim().max(200),
  message: z.string().trim().min(10, 'Message is too short').max(4000),
  // Honeypot: real visitors never fill this hidden field in.
  company_website: z.string().max(0, 'Spam detected').optional().default(''),
});

export type ContactInput = z.infer<typeof contactSchema>;
