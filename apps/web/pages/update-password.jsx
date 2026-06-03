import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'

export default function UpdatePassword() {
  const router = useRouter()
  const [newPass, setNewPass]   = useState('')
  const [message, setMessage]   = useState('')
  const [loading, setLoading]   = useState(false)
  const [authorized, setAuthorized] = useState(false) // guard: only allow via reset link

  useEffect(() => {
    // Supabase puts a recovery session in the URL hash when coming from a reset email.
    // getSession() resolves it automatically if the hash is present.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setAuthorized(true)
      } else {
        // No valid session — redirect back to login
        router.replace('/login')
      }
    })
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)

    const { error } = await supabase.auth.updateUser({ password: newPass })

    setLoading(false)

    if (error) {
      setMessage(error.message)
    } else {
      setMessage('Password updated! Redirecting…')
      setTimeout(() => router.push('/login'), 2000)
    }
  }

  if (!authorized) return null // prevents flash of form before redirect

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ width: 360, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>Set New Password</h1>
        <p style={{ fontSize: 14, color: '#555', margin: 0 }}>
          Choose a new password for your account.
        </p>

        <input
          type="password"
          value={newPass}
          onChange={e => setNewPass(e.target.value)}
          placeholder="New password"
          required
          style={{ padding: '10px 12px', fontSize: 15, border: '1px solid #ccc', borderRadius: 6 }}
        />

        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{
            padding: '10px 12px', fontSize: 15,
            background: '#1A3F5C', color: '#fff',
            border: 'none', borderRadius: 6,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? 'Updating…' : 'Update Password'}
        </button>

        {message && (
          <p style={{ fontSize: 14, color: message.startsWith('Password updated') ? '#2e7d32' : 'red', margin: 0 }}>
            {message}
          </p>
        )}
      </div>
    </div>
  )
}
