// elaya-playbook-schema.ts — the /settings/elaya-playbooks write inputs (Rule 02: first line of
// every action). Human messages only; the SQL CHECKs in 0233 mirror the bounds.
import { z } from 'zod';
import { uuidField } from '@/lib/validations/fields';

const question = z.string().trim().min(3, 'An example question needs at least 3 characters.').max(200, 'Keep an example question under 200 characters.');

export const UpsertElayaPlaybookSchema = z.object({
  id: uuidField('That playbook could not be found.').optional(),
  title: z.string().trim().min(2, 'Give the playbook a short title.').max(120, 'Keep the title under 120 characters.'),
  example_questions: z.array(question).min(1, 'Add at least one example question.').max(12, 'At most 12 example questions.'),
  instructions: z.string().trim().min(10, 'Write what Elaya should do, in a few sentences at least.').max(6000, 'Keep the instructions under 6,000 characters.'),
  active: z.boolean().default(true),
});
export type UpsertElayaPlaybookInput = z.infer<typeof UpsertElayaPlaybookSchema>;

export const DeleteElayaPlaybookSchema = z.object({ id: uuidField('That playbook could not be found.') });
