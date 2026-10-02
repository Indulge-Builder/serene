/**
 * The launch content of the public bot's knowledge pack (0252, docs/architecture/indulge-bot-plan.md
 * section 7a). Written ONLY from what the founder confirmed on 2026-10-01 and from join.indulge.global;
 * nothing here is invented. It is DRAFT content: seed-pack.ts files it as draft rows, a founder reads
 * and approves each one on the library page, then publishes. bench.ts compiles it in memory.
 */

export type LaunchItem = {
  kind: 'fact' | 'story' | 'answer' | 'objection' | 'forbidden' | 'url' | 'ready_message';
  title: string;
  description: string;
  url?: string;
  whenToSend?: string;
  tags?: string[];
  /** A ready message's attachments, by the TITLE of another launch item. */
  attachTitles?: string[];
};

export const LAUNCH_FACTS: LaunchItem[] = [
  {
    kind: 'fact',
    title: 'Who we are',
    description:
      'Indulge is a private luxury concierge. One message on WhatsApp: anything, anywhere, anytime.\n' +
      'Founded in 2022 and based in Goa, India. We serve members across the world: in India, Dubai, the UK and Europe, and the US. We serve members in 180+ countries.',
  },
  {
    kind: 'fact',
    title: 'Our members and our record',
    description:
      'We look after 500+ UHNI families, and the individual members within them.\n' +
      'We have completed 100,000+ requests, and our first response comes in under a minute on average.',
  },
  {
    kind: 'fact',
    title: 'Founders',
    description: 'Karan Bhangay is the Founder and CEO. Advita Bihani is the Co-founder and COO.',
  },
  {
    kind: 'fact',
    title: 'What we do',
    description:
      'Travel: private aviation, hotels, villas, yachts, chauffeurs, visas and immigration.\n' +
      'Dining, Lifestyle, Events, Business, Family and Property.\n' +
      'Members message us on their own WhatsApp group and a dedicated team handles it, around the clock, wherever they are.',
  },
  {
    kind: 'fact',
    title: 'Membership and price',
    description:
      'Membership is by conversation. It is ₹4,00,000 a year plus 18% GST, so ₹4,72,000 in all, for unlimited requests.\n' +
      'There is no trial. The team can walk anyone through what suits them on a call.',
  },
  {
    kind: 'fact',
    title: 'How expenses work',
    description:
      "Indulge's only fee is the membership. Whatever a hotel, airline, vendor or supplier charges for a request, the member pays exactly that, with the supplier's own bill. Indulge adds nothing in between and takes no commission.",
  },
  {
    kind: 'fact',
    title: 'How joining works',
    description:
      'After a conversation, someone from the team calls at a time that suits the person. Then the membership is set up on WhatsApp, usually within a week.',
  },
  {
    kind: 'fact',
    title: 'Hours and calls',
    description:
      'The concierge replies at any hour. Calls with the team happen between 9 am and 7 pm IST, any day of the week.',
  },
  {
    kind: 'fact',
    title: 'Indulge Shop',
    description:
      'Anyone, member or not, can buy watches, bags and other high-end luxury pieces from Indulge Shop, through the Indulge app or at indulgeshop.in.',
  },
  {
    kind: 'fact',
    title: 'The Indulge app',
    description:
      'The Indulge app is free. You sign in with your phone number. The Shop in the app is open to everyone; the full experience unlocks with membership.',
  },
  {
    kind: 'fact',
    title: 'Indulge Legacy',
    description: 'Indulge Legacy makes a family story book: a coffee-table book created by interviewing the generations of a family.',
  },
  {
    kind: 'fact',
    title: 'Privacy',
    description:
      'Conversations are private. They travel encrypted, are stored securely, and only the Indulge team looking after the person can see them.\n' +
      'We have strict NDAs with our members, so we never share who they are or what we do for them.',
  },
  {
    kind: 'fact',
    title: 'Shark Tank India',
    description:
      'Indulge opened Season 4 of Shark Tank India. We did not take a deal, but the experience taught us a great deal, and the exposure brought us new members and, soon after, new investors.',
  },
];

/** The 25 stories on join.indulge.global, word for word (the founder confirmed all are true). */
export const LAUNCH_STORIES: LaunchItem[] = [
  ['A Diet Coke in the Himalayas', 'A Diet Coke, delivered to a remote Himalayan village.', ['travel', 'special']],
  ['Champagne at Everest Base Camp', 'A champagne breakfast at Everest Base Camp.', ['travel', 'experiences']],
  ['Coldplay Bangkok', 'Coldplay in Bangkok, after it sold out in minutes.', ['events', 'concert']],
  ['Wimbledon', "Wimbledon, on 48 hours' notice.", ['events', 'sport']],
  ['Suite Coco Chanel', 'Suite Coco Chanel at the Ritz Paris.', ['travel', 'hotel', 'paris']],
  ['A midnight emergency in Bali', 'A midnight medical emergency in Bali, handled.', ['travel', 'emergency']],
  ['An air ambulance', 'An air ambulance from Phuket to Mumbai.', ['travel', 'emergency']],
  ['The World Cup Final', 'The World Cup Final: tickets, flights and hotel.', ['events', 'sport']],
  ['An Hermès Birkin', 'An Hermès Birkin, sourced in three days.', ['retail', 'shop']],
  ['The Great Migration', 'Front row at the Great Migration.', ['travel', 'experiences']],
  ['3,000 stems', '3,000 stems, delivered before she woke.', ['gifts', 'celebration']],
  ['A Michelin three-star', 'A Michelin three-star in Paris, that weekend.', ['dining', 'paris']],
  ['A lost passport', 'A lost passport in Milan, sorted.', ['travel', 'emergency']],
  ['Kashi Vishwanath', 'VIP darshan at Kashi Vishwanath.', ['travel', 'family']],
  ['A rare koi', 'A rare koi, flown in from Niigata.', ['special']],
  ['Tomorrowland', 'Tomorrowland, after passes sold out worldwide.', ['events', 'concert']],
  ['The Northern Lights', 'The Northern Lights, from a private glass igloo.', ['travel', 'experiences']],
  ['Lake Como', 'A restaurant buyout on Lake Como.', ['dining', 'celebration']],
  ['New Year on a yacht', "New Year's Eve on a private yacht in the Caribbean.", ['travel', 'celebration']],
  ['Mumbai to Zurich', 'A private jet from Mumbai to Zurich.', ['travel', 'aviation']],
  ['Water in Ladakh', 'His mineral water, delivered in Ladakh.', ['travel', 'special']],
  ['Abu Dhabi Grand Prix', 'The Abu Dhabi Grand Prix race weekend.', ['events', 'sport']],
  ['A chef for fourteen', 'A chef flown in for a private dinner of 14.', ['dining', 'celebration']],
  ['St Andrews', 'A tee time on the Old Course at St Andrews.', ['sport', 'travel']],
  ['Art Basel', "Art Basel's VIP first-choice preview.", ['events', 'art']],
].map(([title, description, tags]) => ({ kind: 'story' as const, title: title as string, description: description as string, tags: tags as string[] }));

export const LAUNCH_NEVER_SAY: LaunchItem[] = [
  {
    kind: 'forbidden',
    title: 'Client and member names',
    description: [
      'Kunal Shah', 'Nikhil Kamath', 'Sujeet Kumar', 'Arjun Kapoor', 'Anshula Kapoor', 'Mouni Roy',
      "Krystle D'souza", 'Tanmay Bhatt', 'Washington Sundar', 'Gautham Pai', 'Ashish Saraf',
      'Gitanjali Maini', 'Vikram Reddy', 'Mrunal Pawar',
    ].join('\n'),
  },
  {
    kind: 'forbidden',
    title: 'Retired and private topics',
    description: ['Indulge Blue', 'Revenue, run rate or funding figures', 'Any brand described as our partner'].join('\n'),
  },
];

export const LAUNCH_LIBRARY: LaunchItem[] = [
  {
    kind: 'url',
    title: 'The Indulge app on the App Store',
    description: 'Free; sign in with your phone number.',
    url: 'https://apps.apple.com/us/app/indulge-global/id6476107583',
    whenToSend: 'When someone on an iPhone wants the app or the Shop',
    tags: ['app', 'shop'],
  },
  {
    kind: 'url',
    title: 'The Indulge app on Google Play',
    description: 'Free; sign in with your phone number.',
    url: 'https://play.google.com/store/apps/details?id=com.rutu12.IndulgeApplication',
    whenToSend: 'When someone on Android wants the app or the Shop',
    tags: ['app', 'shop'],
  },
  {
    kind: 'url',
    title: 'Indulge Shop',
    description: 'Watches, bags and other high-end luxury pieces, for anyone.',
    url: 'https://indulgeshop.in',
    whenToSend: 'When someone asks about buying a watch, a bag or a luxury piece',
    tags: ['shop'],
  },
  {
    kind: 'ready_message',
    title: 'The Indulge app',
    description:
      'Here is the Indulge app, {first_name}. It is free: sign in with this number and you can look around the Shop while the team gets back to you.',
    whenToSend: 'After a hand-over, or when someone wants to look around before a call',
    attachTitles: ['The Indulge app on the App Store', 'The Indulge app on Google Play'],
    tags: ['app'],
  },
];

export const LAUNCH_ITEMS: LaunchItem[] = [...LAUNCH_FACTS, ...LAUNCH_STORIES, ...LAUNCH_NEVER_SAY, ...LAUNCH_LIBRARY];
