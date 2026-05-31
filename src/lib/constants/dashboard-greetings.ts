/** Short salutations for the dashboard header — one picked at random per page load. */
export const DASHBOARD_GREETINGS = [
  'Hi',
  'Hey',
  'Hello',
  'Hola',
  'Hey there',
  'Howdy',
  'Yo',
  'Ahoy',
  'Bonjour',
  'Namaste',
  'G\'day',
  'Sup',
] as const;

export function pickDashboardGreeting(): (typeof DASHBOARD_GREETINGS)[number] {
  const index = Math.floor(Math.random() * DASHBOARD_GREETINGS.length);
  return DASHBOARD_GREETINGS[index]!;
}
