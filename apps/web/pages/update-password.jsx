import { useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'

export default function UpdatePassword() {
  const router = useRouter()
  const [newPass, setNewPass] = useState('')
  const [message, setMessage] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    const { error } = await supabase.auth.updateUser({ password: newPass })
    if (error) {
      setMessage(error.message)
    } else {
      setMessage('Password updated! Redirecting...')
      setTimeout(() => router.push('/'), 2000)
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