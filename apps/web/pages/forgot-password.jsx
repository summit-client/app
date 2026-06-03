import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function ForgotPassword() {
  const [email, setEmail]     = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent]       = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (loading || sent) return
    setLoading(true)

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback`,
    })

    setLoading(false)

    if (error) {
      setMessage(error.message)
    } else {
      setSent(true)
      setMessage('Check your email for a reset link.')
    }
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ width: 360, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>Reset Password</h1>
        <p style={{ fontSize: 14, color: '#555', margin: 0 }}>
          Enter your email and we'll send you a reset link.
        </p>

        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="Your email"
          required
          style={{ padding: '10px 12px', fontSize: 15, border: '1px solid #ccc', borderRadius: 6 }}
        />

        <button
          onClick={handleSubmit}
          disabled={loading || sent}
          style={{
            padding: '10px 12px', fontSize: 15,
            background: sent ? '#4caf50' : '#1A3F5C',
            color: '#fff', border: 'none', borderRadius: 6,
            cursor: (loading || sent) ? 'not-allowed' : 'pointer',
            opacity: (loading || sent) ? 0.8 : 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          {loading && (
            <span style={{
              width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)',
              borderTopColor: '#fff', borderRadius: '50%',
              display: 'inline-block', animation: 'spin 0.7s linear infinite',
            }} />
          )}
          {loading ? 'Sending…' : sent ? 'Email sent!' : 'Send Reset Link'}
        </button>

        {message && (
          <p style={{ fontSize: 14, color: sent ? '#2e7d32' : 'red', margin: 0 }}>
            {message}
          </p>
        )}

        <a href="/login" style={{ fontSize: 13, color: '#555', textDecoration: 'none' }}
          onMouseOver={e => (e.currentTarget.style.textDecoration = 'underline')}
          onMouseOut={e  => (e.currentTarget.style.textDecoration = 'none')}
        >
          ← Back to sign in
        </a>
      </div>

      {/* Spinner keyframe — inline since these pages have no shared CSS yet */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
