declare global {
  interface Window { fieldReview: { calls: { action: string; payload: unknown }[] } }
}
window.fieldReview = { calls: [] };
const record = (action: string) => async (payload: unknown) => {
  window.fieldReview.calls.push({ action, payload });
  return { data: null, error: 'Test rejection: keep the draft' };
};
export const createMemberAction = record('member');
export const updateMemberAction = record('member-update');
export const createTicketAction = record('ticket');
export const draftTicketAction = record('draft');
export const upsertTicketSlaPolicyAction = record('policy');
export const deleteTicketSlaPolicyAction = record('delete-policy');
export const searchMembersAction = async () => ({ data: [], error: null });
export const listQueendomStaffAction = async () => ({ data: [{ id: 'genie-1', full_name: 'Ada', sia_role: 'genie' }], error: null });
export const useRouter = () => ({ push() {}, back() {}, refresh() {} });

export const SiaMessagesPeek = () => null;
