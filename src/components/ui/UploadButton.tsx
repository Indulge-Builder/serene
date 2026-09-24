'use client';

import React from 'react';

export interface UploadButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  busy?: boolean;
}

/** File-chooser surface. The caller owns file input, validation, and upload state. */
export const UploadButton = React.forwardRef<HTMLButtonElement, UploadButtonProps>(
  function UploadButton({ busy = false, disabled, type = 'button', className, ...props }, ref) {
    return (
      <button
        {...props}
        ref={ref}
        type={type}
        disabled={disabled || busy}
        aria-busy={busy || props['aria-busy'] || undefined}
        className={['serene-upload', className].filter(Boolean).join(' ')}
      />
    );
  },
);
