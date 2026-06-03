import { useState } from 'react'
import { supabase } from '../lib/supabase'

const ROLE_REDIRECTS: Record<string, string> = {
  admin:     'https://scheduler.summitclient.io',
  scheduler: 'https://scheduler.summitclient.io',
  clinician: 'https://data.summitclient.io',
  staff:     'https://employee.summitclient.io',
  client:    'https://client.summitclient.io',
}

export default function Login() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  async function handleLogin() {
    setLoading(true)
    setError('')

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    console.log('auth result:', { data, error })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    // Fetch role from profiles table
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', data.user.id)
      .single()
    console.log('profile result:', { profile, profileError })

    const role = profile?.role
    const redirect = role ? ROLE_REDIRECTS[role] : null

    // Temporary hardcoded redirect until role_permissions table is built (ac1)
    if (redirect) {
      console.log('redirecting to:', redirect)
      window.location.href = 'http://localhost:3001'
    } else {
      setError('Your account is pending activation. Contact your administrator.')
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ width: 360, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>Sign in to Summit Client</h1>

        {error && <p style={{ color: 'red', margin: 0, fontSize: 14 }}>{error}</p>}

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          style={{ padding: '10px 12px', fontSize: 15, border: '1px solid #ccc', borderRadius: 6 }}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleLogin()}
          style={{ padding: '10px 12px', fontSize: 15, border: '1px solid #ccc', borderRadius: 6 }}
        />
        <button
          onClick={handleLogin}
          disabled={loading}
          style={{ padding: '10px 12px', fontSize: 15, background: '#1A3F5C', color: '#fff', border: 'none', borderRadius: 6, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>

        <a href="/forgot-password" style={{ fontSize: 13, color: '#555', textDecoration: 'none' }}
          onMouseOver={e => (e.currentTarget.style.textDecoration = 'underline')}
          onMouseOut={e  => (e.currentTarget.style.textDecoration = 'none')}
        >
          Forgot password?
        </a>
      </div>
    </div>
  )
}
