type Props = {
  loading: boolean
  loadingLabel: string
  children: React.ReactNode
}

/** Submit button with a real loading state: disabled, spinner, aria-busy, and a label that says what's happening. */
export default function SubmitButton({ loading, loadingLabel, children }: Props) {
  return (
    <button type="submit" className="auth-submit" disabled={loading} aria-busy={loading}>
      {loading && <span className="auth-spinner" aria-hidden="true" />}
      {loading ? loadingLabel : children}
    </button>
  )
}
