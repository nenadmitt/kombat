import { CaretDown, Check } from '@phosphor-icons/react';
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

export interface DropdownOption<T> {
  value: T;
  label: string;
  icon?: ReactNode;
}

export function Dropdown<T extends string | number | null>({
  options,
  value,
  onChange,
}: {
  options: DropdownOption<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const selected = options.find(option => option.value === value);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const items = menuRef.current?.querySelectorAll<HTMLButtonElement>(
      '.dropdown-option',
    );
    const active = Array.from(items ?? []).find(
      item => item.dataset.active === 'true',
    );
    (active ?? items?.[0])?.focus();
  }, [open]);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onMenuKeyDown = (event: KeyboardEvent) => {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>(
        '.dropdown-option',
      ) ?? [],
    );
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      items[Math.min(index + 1, items.length - 1)]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      items[Math.max(index - 1, 0)]?.focus();
    } else if (event.key === 'Escape') {
      event.stopPropagation();
      close();
    } else if (event.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <div className="dropdown" ref={rootRef}>
      <button
        type="button"
        ref={triggerRef}
        className="btn btn-surface"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(current => !current)}
      >
        {selected?.icon}
        {selected?.label ?? ''}
        <CaretDown
          size={12}
          weight="bold"
          className={open ? 'dropdown-caret is-open' : 'dropdown-caret'}
        />
      </button>
      {open && (
        <div
          className="dropdown-menu"
          role="listbox"
          ref={menuRef}
          onKeyDown={onMenuKeyDown}
        >
          {options.map(option => {
            const isActive = option.value === value;
            return (
              <button
                key={String(option.value)}
                type="button"
                role="option"
                aria-selected={isActive}
                data-active={isActive ? 'true' : undefined}
                className={
                  isActive ? 'dropdown-option is-active' : 'dropdown-option'
                }
                onClick={() => {
                  onChange(option.value);
                  close();
                }}
              >
                {option.icon}
                <span className="dropdown-option-label">{option.label}</span>
                {isActive && <Check size={13} weight="bold" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
