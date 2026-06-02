import { useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'

export default function AuthCallback() {
  const router = useRouter()

  useEffect(() => {
    if (!router.isReady) return

    const code = router.query.code

    if (code) {
      supabase.auth.exchangeCodeForSession(String(code)).then(({ error }) => {
        if (error) {
          console.error(error)
          router.replace('/login')
        } else {
          router.replace('/update-password')
        }
      })
    } else {
      router.replace('/login')
    }
  }, [router.isReady])

  return <p>Loading...</p>
}