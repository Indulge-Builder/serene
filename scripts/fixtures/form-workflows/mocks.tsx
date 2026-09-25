import React from 'react';

declare global {
  interface Window {
    formTest: {
      mode: 'error' | 'success' | 'throw' | 'pending' | 'empty';
      calls: unknown[];
      downloads: number;
      resolve?: (result: { data: unknown; error: string | null }) => void;
    };
  }
}
window.formTest = { mode: 'error', calls: [], downloads: 0 };
export async function record(input: unknown) {
  window.formTest.calls.push(input);
  if (window.formTest.mode === 'throw') throw new Error('Simulated network loss');
  if (window.formTest.mode === 'pending') return new Promise<{ data: unknown; error: string | null }>(resolve => { window.formTest.resolve = resolve; });
  return window.formTest.mode === 'error' ? { data: null, error: 'Rejected by test action' } : { data: { id: 'test-record', dealId: 'test-deal' }, error: null };
}
export const addSubscriptionPaymentAction = record;
export const addSubscriptionTopupAction = record;
export const createRechargeAction = record;
export const useRouter = () => ({ refresh() {} });
export const useToast = { success() {}, danger() {} };
export function InvoiceField({ onUploadingChange, onChange }: { onUploadingChange: (busy: boolean) => void; onChange: (path: string) => void }) {
  return <div><button type="button" id="start-upload" onClick={() => onUploadingChange(true)}>Start simulated upload</button><button type="button" id="finish-upload" onClick={() => { onChange('test/invoice.pdf'); onUploadingChange(false); }}>Finish simulated upload</button></div>;
}

export const createWalkInDeal = record;
export const listAgentsForDealDomain = async () => ({data:[],error:null});
export const DEAL_CELEBRATE_STORAGE_KEY = 'test-deal-celebration';
export async function getSubscriptionMonthlyReportAction(month: string) {
  const result = await record(month);
  if (result.error) return result;
  return {data:{rows:window.formTest.mode === 'empty' ? [] : [{name:'Test subscription',departments:['tech'],type:'monthly',currency:'USD',originalAmount:12.5,inrPaid:1050.25,dueDate:'2026-09-10',paidDate:'2026-09-25'}]},error:null};
}
export const buildCSV = () => 'test report';
export const buildSingleSheetXLSX = async () => new Uint8Array([0]);
export const triggerBrowserDownload = () => { window.formTest.downloads++; };
