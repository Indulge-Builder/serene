import { CircleCheck, Info, TriangleAlert } from 'lucide-react';
import type { ComponentPropsWithoutRef, CSSProperties } from 'react';
import { semanticTones, type SemanticTone } from './Badge';

/** Persistent feedback; reserve danger for failures requiring the user's attention. */
export function Alert({ tone = 'info', title, children, action, className, style, role, ...props }: Omit<ComponentPropsWithoutRef<'div'>, 'title'> & {
  tone?: SemanticTone;
  title?: string;
  action?: React.ReactNode;
}) {
  const material = semanticTones[tone];
  const Icon = tone === 'success' ? CircleCheck : tone === 'danger' || tone === 'warning' ? TriangleAlert : Info;
  return (
    <div {...props} role={role ?? (tone === 'danger' ? 'alert' : 'status')} className={['serene-alert', className].filter(Boolean).join(' ')} style={{ '--alert-fill': material.fill, '--alert-ink': material.ink, ...style } as CSSProperties}>
      <Icon size={16} strokeWidth={1.5} aria-hidden="true" className="serene-alert-icon" />
      <div className="serene-alert-content">
        {title && <p className="serene-alert-title">{title}</p>}
        <div>{children}</div>
        {action && <div className="serene-alert-action">{action}</div>}
      </div>
    </div>
  );
}
