'use client';

import { Children, Fragment, isValidElement, useId, type CSSProperties, type ReactNode } from 'react';
import { FilterDropdown, type FilterDropdownItem } from './FilterDropdown';
import { useFieldAttributes } from './Field';

export interface FormSelectProps {
  /** Controlled scalar value. Empty options remain explicit choices. */
  value: string | number;
  onValueChange: (value: string) => void;
  /** Plain option elements, optgroups, arrays, and fragments; rendered in the shared listbox. */
  children: ReactNode;
  id?: string;
  /**
   * Registers the value with a plain <form> post through a hidden input
   * (2026-09-25), so a server action reading FormData sees it exactly as it
   * saw the native select's.
   */
  name?: string;
  disabled?: boolean;
  'aria-label'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean | 'true' | 'false';
  fullWidth?: boolean;
  /** Layout only. Field material belongs to the shared control. */
  style?: CSSProperties;
  className?: string;
}

function optionText(children: ReactNode): string {
  return Children.toArray(children).map(child => {
    if (typeof child === 'string' || typeof child === 'number') return String(child);
    if (isValidElement<{ children?: ReactNode }>(child)) return optionText(child.props.children);
    return '';
  }).join('');
}

/** Options in document order; an <optgroup> lends its label to its options as their group. */
function readOptions(children: ReactNode, group?: string, groupDisabled = false): FilterDropdownItem[] {
  return Children.toArray(children).flatMap(child => {
    if (!isValidElement<{ children?: ReactNode; value?: string | number; disabled?: boolean; hidden?: boolean; label?: string }>(child)) return [];
    if (child.type === Fragment) return readOptions(child.props.children, group, groupDisabled);
    if (child.props.hidden) return [];
    if (child.type === 'optgroup') return readOptions(child.props.children, child.props.label, groupDisabled || !!child.props.disabled);
    if (child.type !== 'option' || child.props.hidden) return [];
    const label = child.props.label ?? optionText(child.props.children);
    return [{ id: String(child.props.value ?? label), label, disabled: groupDisabled || child.props.disabled, group }];
  });
}

/** Themed form picker backed by the same portaled, keyboard-operated listbox as filters.
 * Use native Select for browser constraint validation, form-library refs, or multi-selects.
 */
export function FormSelect({ value, onValueChange, children, fullWidth = true, name, ...props }: FormSelectProps) {
  const generatedId = useId();
  const field = useFieldAttributes(props);
  const items = readOptions(children);
  const selected = String(value);
  const label = items.find(item => item.id === selected)?.label ?? 'Choose an option';
  const triggerId = field.id ?? generatedId;
  // A trigger named by a <label htmlFor> would never announce its value; the
  // current choice rides along as its description ("Domain, button, Concierge").
  const valueId = `${triggerId}-value`;
  const describedBy = [field['aria-describedby'], valueId].filter(Boolean).join(' ');
  return (
    <>
      <FilterDropdown
        triggerId={triggerId}
        appearance="field"
        label={label}
        items={items}
        selected={[selected]}
        onChange={values => onValueChange(values[0] ?? '')}
        fullWidth={fullWidth}
        menuPortal
        hideCountBadge
        clearable={false}
        disabled={props.disabled}
        ariaLabel={props['aria-label'] ? `${props['aria-label']}: ${label}` : undefined}
        ariaDescribedBy={describedBy}
        ariaRequired={field.required}
        invalid={field['aria-invalid'] === true || field['aria-invalid'] === 'true'}
        className={props.className}
        style={props.style}
      />
      <span id={valueId} className="sr-only">{label}</span>
      {name && <input type="hidden" name={name} value={selected} disabled={props.disabled} />}
    </>
  );
}
