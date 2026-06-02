import { useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'

export default function AuthCallback() {
  const router = useRouter()

  useEffect(() => {
    if (!router.isReady) return

    const { token_hash, type } = router.query

    if (token_hash && type) {
      supabase.auth.verifyOtp({ token_hash, type }).then(({ error }) => {
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