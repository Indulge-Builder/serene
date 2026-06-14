// RevivalDossierAction — the dossier mount point for the shared <ReviveLeadButton>.
// Async server component: renders ONLY when the lead has an open revival_candidate,
// surfacing the AI reasoning + the Revive action inline on the dossier (the second
// of the button's two mount points). Revival creates a "Revived" follow-up task and
// resolves the candidate — it NEVER changes the lead's status (that's the separate
// junk→in_discussion StatusActionPanel button).

import { getOpenCandidateForLead } from '@/lib/services/revival-service';
import { formatDate } from '@/lib/utils/dates';
import { ReviveLeadButton } from '@/components/leads/ReviveLeadButton';
import { Sparkles } from 'lucide-react';

export async function RevivalDossierAction({ leadId }: { leadId: string }) {
  const candidate = await getOpenCandidateForLead(leadId);
  if (!candidate) return null;

  return (
    <div
      className="rounded-md border border-(--theme-paper-border) bg-(--theme-paper) shadow-(--shadow-1)"
      style={{ marginTop: 'var(--space-4)', padding: 'var(--space-4) var(--space-5)' }}
    >
      <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <Sparkles className="w-4 h-4" strokeWidth={1.5} style={{ color: 'var(--theme-accent)' }} />
            <span className="type-eyebrow m-0">Revival suggested</span>
          </div>
          <p
            style={{
              margin: '6px 0 0',
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--text-xs)',
              color: 'var(--theme-text-secondary)',
              lineHeight: 1.5,
            }}
          >
            {candidate.ai_reasoning}
          </p>
          {candidate.suggested_revive_at && (
            <p style={{ margin: '4px 0 0', fontSize: 'var(--text-2xs)', color: 'var(--theme-text-tertiary)' }}>
              Suggested: {formatDate(candidate.suggested_revive_at, 'd MMM yyyy')}
            </p>
          )}
        </div>
        <div style={{ flexShrink: 0 }}>
          <ReviveLeadButton leadId={leadId} candidateId={candidate.id} showDismiss size="sm" />
        </div>
      </div>
    </div>
  );
}
