import { InputHTMLAttributes, useId, useState } from 'react'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'className'> & {
  label: string
  error?: string
}

/**
 * Labeled input with inline validation and, for `type="password"`, a
 * show/hide toggle. Wires aria-invalid/aria-describedby to the error text
 * so a screen reader announces the specific problem, not just "invalid".
 */
export default function FormField({ label, error, type, ...inputProps }: Props) {
  const id = useId()
  const errorId = `${id}-error`
  const [revealed, setRevealed] = useState(false)
  const isPassword = type === 'password'
  const resolvedType = isPassword ? (revealed ? 'text' : 'password') : type

  return (
    <div className="auth-field">
      <label htmlFor={id} className="auth-label">{label}</label>
      <div className="auth-input-wrap">
        <input
          {...inputProps}
          id={id}
          type={resolvedType}
          className="auth-input"
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? errorId : undefined}
        />
        {isPassword && (
          <button
            type="button"
            className="auth-toggle-visibility"
            onClick={() => setRevealed(r => !r)}
            aria-label={revealed ? 'Hide password' : 'Show password'}
            aria-pressed={revealed}
          >
            {revealed ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        )}
      </div>
      {error && (
        <p className="auth-field-error" id={errorId} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 3l18 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M10.6 5.2A11.6 11.6 0 0 1 12 5c7 0 11 7 11 7a13.6 13.6 0 0 1-3.4 4.1M6.6 6.6C3.7 8.4 1 12 1 12s4 7 11 7a10.6 10.6 0 0 0 4.4-.9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
