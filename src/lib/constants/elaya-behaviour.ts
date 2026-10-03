// elaya-behaviour.ts — THE loader of Elaya's shared behaviour policy (2026-10-02).
//
// The policy itself lives in ONE file both brains read: backend/app/brain/elaya_behaviour.json
// (it has to sit under backend/app because the Python service's Docker build copies only that
// folder). This module turns it into the prompt block and the constants the Node side folds; the
// Python twin is backend/app/brain/behaviour.py, and both build the block with the same join so
// the shared cached prefix is byte-identical. Never paste the policy text into a prompt file.
//
// Version bookkeeping: ELAYA_BEHAVIOUR_VERSION comes from the JSON; ELAYA_PROMPT_VERSION is the
// persona builder's own version. Every turn records both on its message row (meta), so a
// regression can be traced to the policy, the prompt or the model.

import policy from '../../../backend/app/brain/elaya_behaviour.json';

type BehaviourPolicy = {
  version: string;
  identity: string;
  core: string[];
  resolution_order: string;
  audiences: Record<'nudge' | 'brief' | 'sensitive' | 'member_facing' | 'voice', string>;
  forbidden_phrases: string[];
};

const POLICY = policy as BehaviourPolicy;

export const ELAYA_BEHAVIOUR_VERSION: string = POLICY.version;
/** The persona builder's version (persona.ts + persona.py): bump when the shared block's structure changes. */
export const ELAYA_PROMPT_VERSION = 'persona-v3';
export const ELAYA_BEHAVIOUR_RESOLUTION: string = POLICY.resolution_order;
export const ELAYA_BEHAVIOUR_AUDIENCES = POLICY.audiences;
/** The founder's list of phrases that sound like a generic AI report; the eval fixtures refuse them. */
export const ELAYA_FORBIDDEN_PHRASES: readonly string[] = POLICY.forbidden_phrases;

/** The shared behaviour block: identity, then the core as a bullet list. Same join as behaviour.py. */
export function buildBehaviourBlock(): string {
  return `${POLICY.identity}\n\nHow you answer:\n${POLICY.core.map((line) => `- ${line}`).join('\n')}`;
}

/** One audience rule by name, for renderers outside chat (the brief, a nudge, the voice block). */
export function behaviourAudience(name: keyof BehaviourPolicy['audiences']): string {
  return POLICY.audiences[name];
}
