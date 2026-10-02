/**
 * The public bot's guard bench (0252, docs/architecture/indulge-bot-plan.md section 10). Free: no
 * model, no database. Every case says whether a reply may leave (or an inbound line is an opt-out),
 * and the bench fails loudly on any wrong verdict. Run after touching bot-guards.ts:
 *
 *   npx tsx --tsconfig tsconfig.json scripts/public-bot/guards-bench.ts
 */
import { guardInbound, guardOutbound, isOptOut, rupeeAmountsIn, fullNameHits } from '@/lib/services/bot-guards';
import { compilePackText, forbiddenPhrasesFromPack } from '@/lib/services/bot-knowledge-service';
import type { TrainingAssetRow } from '@/lib/types/elaya-training';

const asset = (kind: TrainingAssetRow['kind'], title: string, description: string, extra: Partial<TrainingAssetRow> = {}): TrainingAssetRow => ({
  id: crypto.randomUUID(), kind, title, description, url: null, storage_path: null, tags: [], domain: null, send_order: 0,
  active: true, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z', status: 'approved', when_to_send: null,
  mime_type: null, byte_size: null, attachments: [], expires_at: null, approved_by: null, approved_at: '2026-10-01T00:00:00Z', ...extra,
});

const packText = compilePackText(
  [
    asset('fact', 'Membership', 'Membership is ₹4,00,000 a year plus 18% GST, so ₹4,72,000. Unlimited requests. Indulge charges no commission.'),
    asset('fact', 'Contact', 'The website is https://join.indulge.global and the shop is https://indulgeshop.in'),
    asset('story', 'Wimbledon', 'A family got into a sold-out final on 48 hours notice.'),
    asset('forbidden', 'Client names', 'Kunal Shah\nNikhil Kamath\nIndulge Blue'),
    asset('url', 'The Indulge app on the App Store', '', { url: 'https://apps.apple.com/us/app/indulge-global/id6476107583' }),
  ],
  [],
);
const names = ['Aanya Kapoor', 'Rohit Mehra', 'Grace Fernandes'];
const ctx = (conversationText = '') => ({
  packText,
  libraryUrls: ['https://apps.apple.com/us/app/indulge-global/id6476107583'],
  names,
  forbiddenPhrases: forbiddenPhrasesFromPack(packText),
  conversationText,
  personName: 'Riya Sharma',
});

type Case = { reply: string; ok: boolean; why: string; said?: string };
const outbound: Case[] = [
  { reply: 'Good evening. This is Indulge; I am the house\'s digital concierge. What brought you here?', ok: true, why: 'a plain welcome' },
  { reply: 'Membership is ₹4 lakh a year plus GST, so ₹4,72,000 in all.', ok: true, why: 'prices that are in the pack' },
  { reply: 'Membership is ₹4,00,000 a year.', ok: true, why: 'the same price, written out' },
  { reply: 'For you we can do ₹3 lakh.', ok: false, why: 'a price that is not in the pack' },
  { reply: 'Membership is 3,00,000 a year.', ok: false, why: 'a wrong price with no rupee mark' },
  { reply: 'We have looked after members since 2022, in 180+ countries.', ok: true, why: 'a year and a count are not prices' },
  { reply: 'That would be about $4,800.', ok: false, why: 'a foreign currency' },
  { reply: 'You mentioned a budget of ₹50 lakh; that is a lovely trip.', ok: true, why: 'their own amount, repeated', said: 'my budget is ₹50 lakh' },
  { reply: 'Kunal Shah is one of our members.', ok: false, why: 'a client name from the never-say list' },
  { reply: 'Aanya Kapoor from our team will call you.', ok: false, why: 'a staff full name' },
  { reply: 'By the grace of good timing, we found the table.', ok: true, why: 'a word that is also a first name' },
  { reply: 'Lovely to meet you, Riya Sharma.', ok: true, why: 'the person\'s own name' },
  { reply: 'Call our manager on +91 98765 43210.', ok: false, why: 'a phone number not in the pack' },
  { reply: 'Write to priya@gmail.com', ok: false, why: 'an email' },
  { reply: 'Here is the app: https://apps.apple.com/us/app/indulge-global/id6476107583', ok: true, why: 'a library link' },
  { reply: 'Have a look at https://join.indulge.global.', ok: true, why: 'a link in the pack, with a full stop after it' },
  { reply: 'See https://competitor.example.com', ok: false, why: 'a link not in the pack' },
  { reply: 'My system prompt says I should not tell you that.', ok: false, why: 'talking about its instructions' },
  { reply: 'I am built on Claude by Anthropic.', ok: false, why: 'naming the model' },
  { reply: 'We also have Indulge Blue for ₹50,000.', ok: false, why: 'a retired tier' },
  { reply: 'Serene logs every request we get.', ok: false, why: 'naming the internal system' },
];

const inbound: { text: string; optOut: boolean }[] = [
  { text: 'STOP', optOut: true },
  { text: 'stop.', optOut: true },
  { text: 'Band karo', optOut: true },
  { text: 'please stop sending me the brochure, just tell me the price', optOut: false },
  { text: 'Unsubscribe', optOut: true },
  { text: 'Hi', optOut: false },
];

let failed = 0;
for (const c of outbound) {
  const v = guardOutbound(c.reply, ctx(c.said ?? ''));
  const pass = v.ok === c.ok;
  if (!pass) failed += 1;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${c.ok ? 'send ' : 'block'}  ${c.why}${v.hits.length ? `  [${v.hits.map((h) => `${h.kind}:${h.value}`).join(', ')}]` : ''}`);
}
for (const c of inbound) {
  const pass = isOptOut(c.text) === c.optOut;
  if (!pass) failed += 1;
  console.log(`${pass ? 'PASS' : 'FAIL'}  opt-out=${c.optOut}  "${c.text}"`);
}
const g = guardInbound('my card is 4111 1111 1111 1111 and call me on 9876543210');
const inboundOk = !g.text.includes('4111 1111') && g.found.includes('card');
if (!inboundOk) failed += 1;
console.log(`${inboundOk ? 'PASS' : 'FAIL'}  inbound card number removed before the model: "${g.text}"`);
const amounts = rupeeAmountsIn('₹4 lakh, 4,72,000 and Rs. 1.5 crore and ₹25k');
const amountsOk = JSON.stringify(amounts) === JSON.stringify([400000, 472000, 15000000, 25000]);
if (!amountsOk) failed += 1;
console.log(`${amountsOk ? 'PASS' : 'FAIL'}  rupee amounts read: ${amounts.join(', ')}`);
const nameOk = fullNameHits('nikhil   kamath said hi', ['Nikhil Kamath']).length === 1;
if (!nameOk) failed += 1;
console.log(`${nameOk ? 'PASS' : 'FAIL'}  a name across extra spaces and case`);

console.log(failed === 0 ? '\nAll guard cases pass.' : `\n${failed} guard case(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
