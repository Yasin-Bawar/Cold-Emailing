import { z } from 'zod';

export const LEAD_STATUSES = ['new', 'queued', 'sent', 'replied', 'interested', 'won', 'lost', 'unsubscribed', 'bounced'] as const;
export const EMAIL_STATUSES = ['draft', 'approved', 'sending', 'sent', 'failed', 'cancelled', 'skipped'] as const;
export const CAMPAIGN_STATUSES = ['draft', 'active', 'paused', 'done'] as const;

const str = (max = 500) => z.string().trim().max(max);
const opt = (max = 500) => str(max).nullish();

export const LeadInput = z.object({
  email: z.string().trim().toLowerCase().email(),
  business_name: opt(300),
  contact_name: opt(200),
  category: opt(100),
  city: opt(120),
  state: opt(60),
  timezone: opt(60),
  phone: opt(60),
  address: opt(400),
  website: opt(400),
  source_url: opt(1000),
  score: z.coerce.number().int().min(0).max(100).nullish(),
  notes: opt(5000),
  // Extra details used by the email templates: hook (one personal line), specialty, rating, reviews, type (business type key).
  custom: z.record(z.string(), z.union([z.string().max(1000), z.number(), z.boolean(), z.null()])).optional(),
});
export type LeadInput = z.infer<typeof LeadInput>;

export const LeadPatch = z.object({
  status: z.enum(LEAD_STATUSES).optional(),
  notes: opt(5000),
  business_name: opt(300),
  contact_name: opt(200),
  category: opt(100),
  city: opt(120),
  state: opt(60),
  timezone: opt(60),
  phone: opt(60),
  website: opt(400),
  score: z.coerce.number().int().min(0).max(100).nullish(),
  campaign_id: z.string().uuid().nullish(),
  custom: z.record(z.string(), z.union([z.string().max(1000), z.number(), z.boolean(), z.null()])).optional(),
});
export type LeadPatch = z.infer<typeof LeadPatch>;

export const LeadFilter = z.object({
  q: opt(200),
  status: z.array(z.enum(LEAD_STATUSES)).optional(),
  campaign_id: z.string().uuid().optional(),
  list_id: z.string().uuid().optional(),
  city: z.array(str(120)).optional(),
  state: z.array(str(60)).optional(),
  category: z.array(str(100)).optional(),
  replied: z.boolean().optional(),
  has_email_draft: z.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(25),
  offset: z.coerce.number().int().min(0).default(0),
  sort: z.enum(['created_at', 'business_name', 'city', 'status', 'score', 'last_reply_at']).default('created_at'),
  dir: z.enum(['asc', 'desc']).default('desc'),
});
export type LeadFilter = z.infer<typeof LeadFilter>;

export const EmailInput = z.object({
  lead_id: z.string().uuid().optional(),
  lead_email: z.string().trim().toLowerCase().email().optional(),
  campaign_id: z.string().uuid().nullish(),
  step: z.coerce.number().int().min(0).max(10).default(0),
  delay_days: z.coerce.number().int().min(0).max(60).default(0),
  subject: str(300).min(1),
  html: z.string().max(2_000_000).nullish(),
  text: z.string().max(100_000).nullish(),
  design: z.string().max(60).nullish(),
});
export type EmailInput = z.infer<typeof EmailInput>;

export const AccountInput = z.object({
  provider: z.enum(['gmail', 'resend']),
  email: z.string().trim().toLowerCase().email(),
  from_name: opt(120),
  secret: z.string().min(8).max(500),
  daily_cap: z.coerce.number().int().min(1).max(500).default(40),
  warmup_start: z.string().date().optional(),
});

export const SettingsPatch = z.object({
  postal_address: opt(400),
  from_name: opt(120),
  reply_to: z.string().trim().toLowerCase().email().nullish().or(z.literal('')),
  paused: z.boolean().optional(),
  default_daily_cap: z.coerce.number().int().min(1).max(500).optional(),
});
