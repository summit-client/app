import { useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'

export default function UpdatePassword() {
  const router = useRouter()
  const [newPass, setNewPass] = useState('')
  const [message, setMessage] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    const session = JSON.parse(localStorage.getItem('sb-xbkokyxegrxutppolgtz-auth-token'))
    const res = await fetch('https://xbkokyxegrxutppolgtz.supabase.co/auth/v1/user', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + session.access_token,
        'apikey': 'sb_publishable_nBoBo2BVzUst8xxu0bLrqw_4QZJ06Oh'
      },
      body: JSON.stringify({ password: newPass })
    })
    const data = await res.json()
    if (data.email) {
      setMessage('Password updated! Redirecting...')
      setTimeout(() => router.push('/'), 2000)
    } else {
      setMessage(data.msg || data.message || 'An error occurred')
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <h1>Set New Password</h1>
      <input
        type="password"
        value={newPass}
        onChange={e => setNewPass(e.target.value)}
        placeholder="New password"
        required
      />
      <button type="submit">Update Password</button>
      {message && <p>{message}</p>}
    </form>
  )
}