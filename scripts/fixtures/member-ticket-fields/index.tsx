import React from 'react';
import { createRoot } from 'react-dom/client';
import { LazyMotion, domAnimation, MotionConfig } from 'framer-motion';
import { MemberFormModal } from '../../../src/components/members/MemberFormModal';
import { NewTicketForm } from '../../../src/components/tickets/NewTicketForm';
import { TicketSlaPoliciesPanel } from '../../../src/components/settings/TicketSlaPoliciesPanel';
import { TICKET_CATEGORIES, TICKET_SUB_CATEGORIES } from '../../../src/lib/constants/tickets';
import './mocks';
const form = new URLSearchParams(location.search).get('form');
const queendoms = [{ id: 'q-1', name: 'Mumbai', slug: 'mumbai' }];
createRoot(document.getElementById('root')!).render(<LazyMotion features={domAnimation}><MotionConfig reducedMotion="always">
  {form === 'member' && <MemberFormModal open onClose={() => {}} queendoms={queendoms} defaultQueendomId={null} canPickQueendom />}
  {form === 'ticket' && <NewTicketForm initialMember={{ id: 'member-1', full_name: 'Test Member', queendom_id: 'q-1' }} callerQueendomId="q-1" />}
  {form === 'policy' && <TicketSlaPoliciesPanel initialPolicies={[]} queendoms={queendoms} />}
  <output id="categories" hidden>{JSON.stringify({ categories: TICKET_CATEGORIES.options, subs: TICKET_SUB_CATEGORIES })}</output>
</MotionConfig></LazyMotion>);
