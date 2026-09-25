import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LazyMotion, domAnimation, MotionConfig } from 'framer-motion';
import { RecordPaymentModal } from '../../../src/components/subscriptions/RecordPaymentModal';
import { LogTopupModal } from '../../../src/components/subscriptions/LogTopupModal';
import { AddRechargeModal } from '../../../src/components/budget/AddRechargeModal';
import { NewDealModal } from '../../../src/components/deals/NewDealModal';
import { SubscriptionExportButton } from '../../../src/components/subscriptions/SubscriptionExportButton';
import { WonDealModal } from '../../../src/components/leads/WonDealModal';
import type { SubscriptionRow } from '../../../src/lib/types/subscription';
import './mocks';

const subscription: SubscriptionRow = { id:'test-subscription', name:'Test subscription', type:'monthly', currency:'USD', amount:12.5, due_day:10, due_date:null, departments:['tech'], login:null, password:null, notes:null, is_archived:false, created_by:null, created_at:'2026-01-01', updated_at:'2026-01-01', tool_id:null };
function Fixture() {
  const [open, setOpen] = useState(false);
  const form = new URLSearchParams(location.search).get('form');
  const close = () => setOpen(false);
  return <LazyMotion features={domAnimation}><MotionConfig reducedMotion="always">
    <button id="open" type="button" onClick={() => setOpen(true)}>Open form</button>
    {form === 'payment' && <RecordPaymentModal open={open} onClose={close} subscription={subscription} />}
    {form === 'topup' && <LogTopupModal open={open} onClose={close} subscription={{...subscription,type:'top_up'}} />}
    {form === 'recharge' && <AddRechargeModal open={open} onClose={close} />}
    {form === 'export' && <SubscriptionExportButton />}
    {form === 'deal' && <NewDealModal open={open} onClose={close} callerRole="agent" callerDomain="shop" callerName="Test Agent" callerId="test-agent" />}
    {form === 'won' && <WonDealModal open={open} onClose={close} leadId="test-lead" domain="shop" isPending={false} error={null} onConfirm={payload => { window.formTest.calls.push(payload); }} />}
    <output id="open-state">{String(open)}</output>
  </MotionConfig></LazyMotion>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
