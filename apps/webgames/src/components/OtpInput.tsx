import { useRef } from 'react';

type Props = {
  length: number;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

/**
 * A row of single-digit boxes over one hidden field: the field owns the value
 * and the caret, so paste, autofill and the OS one-time-code suggestion all
 * work, which per-box inputs break.
 */
export function OtpInput({ length, value, onChange, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const active = Math.min(value.length, length - 1);

  return (
    <div className="otp" onClick={() => inputRef.current?.focus()}>
      <input
        ref={inputRef}
        className="otp-field"
        value={value}
        onChange={event =>
          onChange(event.target.value.replace(/\D/g, '').slice(0, length))
        }
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={length}
        disabled={disabled}
        aria-label={`${length}-digit code`}
        autoFocus
      />
      {Array.from({ length }, (_, i) => (
        <span
          key={i}
          className={
            i === active && !disabled ? 'otp-box is-active' : 'otp-box'
          }
          aria-hidden
        >
          {value[i] ?? ''}
        </span>
      ))}
    </div>
  );
}
