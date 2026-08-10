import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { X } from '@phosphor-icons/react';
import type { ReactNode } from 'react';

/**
 * Shared primitives. Radix supplies the behaviour (focus trapping, escape,
 * roving focus, ARIA); the look comes from our own tokens.
 */

export function Switch({
  checked,
  onCheckedChange,
  label,
}: {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <SwitchPrimitive.Root
      className="switch"
      checked={checked}
      onCheckedChange={onCheckedChange}
      aria-label={label}
    >
      <SwitchPrimitive.Thumb className="switch-thumb" />
    </SwitchPrimitive.Root>
  );
}

export function Sheet({
  open,
  onOpenChange,
  title,
  subtitle,
  children,
  footer,
  dismissible = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** False when the sheet asks for something the match cannot continue without. */
  dismissible?: boolean;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="modal-backdrop" />
        <DialogPrimitive.Content className="modal sheet">
          <div className="sheet-head">
            <div>
              <DialogPrimitive.Title className="modal-title">
                {title}
              </DialogPrimitive.Title>
              {subtitle && (
                <DialogPrimitive.Description className="sheet-sub">
                  {subtitle}
                </DialogPrimitive.Description>
              )}
            </div>
            {dismissible && (
              <DialogPrimitive.Close className="icon-btn" aria-label="Close">
                <X size={16} />
              </DialogPrimitive.Close>
            )}
          </div>
          <div className="sheet-body">{children}</div>
          {footer}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (next: T) => void;
}) {
  return (
    <div className="segmented" role="tablist">
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={option.value === value}
          className={option.value === value ? 'seg-opt is-active' : 'seg-opt'}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <span className="card-label">{label.toUpperCase()}</span>
      {children}
    </div>
  );
}
