import { useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'

export default function AuthCallback() {
  const router = useRouter()

  useEffect(() => {
    const run = async () => {
      const hash = window.location.hash

      // Let Supabase process session from URL
      await supabase.auth.exchangeCodeForSession(window.location.hash)

      // Detect recovery flow safely
      const isRecovery = hash.includes('type=recovery')
      const isInvite = hash.includes('type=invite')

      if (isRecovery || isInvite) {
        router.replace('/update-password')
        return
      }

      router.replace('/')
    }

    run()
  }, [])

  return <p>Loading...</p>
}