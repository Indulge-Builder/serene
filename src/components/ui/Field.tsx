'use client';

import { createContext, useContext, useId, type ComponentPropsWithRef, type ReactNode } from 'react';

const FieldContext = createContext<{ id: string; description?: string; invalid: boolean; required: boolean } | null>(null);

/** A label, help, and validation contract shared by native field families. */
export function Field({ label, htmlFor, hint, error, required = false, children }: {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  children: ReactNode;
}) {
  const generatedId = useId();
  const id = htmlFor ?? generatedId;
  const description = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;
  return (
    <FieldContext.Provider value={{ id, description, invalid: !!error, required }}>
      <div className="serene-field">
        <label className="serene-field-label" htmlFor={id}>
          {label}{required && <span aria-hidden="true" className="serene-field-required"> *</span>}
        </label>
        {children}
        {hint && <p id={`${id}-hint`} className="serene-field-hint">{hint}</p>}
        {error && <p id={`${id}-error`} className="serene-field-error" role="alert">{error}</p>}
      </div>
    </FieldContext.Provider>
  );
}

function useFieldAttributes(props: { id?: string; required?: boolean; 'aria-describedby'?: string; 'aria-invalid'?: ComponentPropsWithRef<'input'>['aria-invalid'] }) {
  const field = useContext(FieldContext);
  return {
    id: props.id ?? field?.id,
    required: props.required ?? field?.required,
    'aria-invalid': props['aria-invalid'] ?? (field?.invalid || undefined),
    'aria-describedby': [...new Set([props['aria-describedby'], field?.description].filter(Boolean).join(' ').split(' ').filter(Boolean))].join(' ') || undefined,
  };
}

/** Native attributes, refs, and form-library handlers pass through unchanged. */
export function Input({ className, ...props }: ComponentPropsWithRef<'input'>) {
  const field = useFieldAttributes(props);
  return <input {...props} {...field} className={['serene-field-control', className].filter(Boolean).join(' ')} />;
}

export function Textarea({ className, ...props }: ComponentPropsWithRef<'textarea'>) {
  const field = useFieldAttributes(props);
  return <textarea rows={4} {...props} {...field} className={['serene-field-control', className].filter(Boolean).join(' ')} />;
}

export function Select({ className, ...props }: ComponentPropsWithRef<'select'>) {
  const field = useFieldAttributes(props);
  return <select {...props} {...field} className={['serene-field-control', className].filter(Boolean).join(' ')} />;
}
