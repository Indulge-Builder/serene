// Call Intelligence — Zod schemas for service_cases / conversation_hooks
// writes. Human-readable messages only — never Zod defaults (Rule: no raw
// Zod message reaches the UI).

import { z } from 'zod';
import { APP_DOMAIN_ENUM } from '@/lib/constants/domains';
import { uuidField } from '@/lib/validations/fields';

const TAG_PATTERN = /^[a-z0-9_-]+$/;

export const ServiceCaseSchema = z.object({
  id:           uuidField('Invalid case reference.').optional(),
  domain:       z.enum(APP_DOMAIN_ENUM, { message: 'Please select a valid domain.' }),
  category:     z
    .string()
    .min(1, 'Please select a category.')
    .max(50, 'Category must be 50 characters or fewer.')
    .regex(TAG_PATTERN, 'Category must be a lowercase slug.'),
  title:        z
    .string()
    .trim()
    .min(1, 'A title is required.')
    .max(120, 'Title must be 120 characters or fewer.'),
  summary:      z
    .string()
    .trim()
    .min(1, 'A summary is required.')
    .max(1000, 'Summary must be 1000 characters or fewer.'),
  outcome_note: z.string().trim().max(500, 'Outcome note must be 500 characters or fewer.').nullable().optional(),
  city:         z.string().trim().max(80, 'City must be 80 characters or fewer.').nullable().optional(),
  country:      z.string().trim().max(80, 'Country must be 80 characters or fewer.').nullable().optional(),
  tags:         z
    .array(
      z
        .string()
        .trim()
        .toLowerCase()
        .min(1, 'Tags cannot be empty.')
        .max(40, 'Each tag must be 40 characters or fewer.')
        .regex(TAG_PATTERN, 'Tags are lowercase slugs — letters, numbers, underscores.'),
    )
    .max(10, 'Use at most 10 tags — quality over quantity.')
    .default([]),
  is_featured:  z.boolean().default(false),
  sort_order:   z.number().int().min(0).max(10_000).default(0),
});

export type ServiceCaseInput = z.input<typeof ServiceCaseSchema>;

export const ConversationHookSchema = z.object({
  id:         uuidField('Invalid hook reference.').optional(),
  domain:     z.enum(APP_DOMAIN_ENUM, { message: 'Please select a valid domain.' }),
  category:   z
    .string()
    .min(1, 'Please select a category.')
    .max(50, 'Category must be 50 characters or fewer.')
    .regex(TAG_PATTERN, 'Category must be a lowercase slug.'),
  hook:       z
    .string()
    .trim()
    .min(1, 'The hook line is required.')
    .max(600, 'Hooks must be 600 characters or fewer.'),
  context:    z.string().trim().max(300, 'Context must be 300 characters or fewer.').nullable().optional(),
  sort_order: z.number().int().min(0).max(10_000).default(0),
});

export type ConversationHookInput = z.input<typeof ConversationHookSchema>;
