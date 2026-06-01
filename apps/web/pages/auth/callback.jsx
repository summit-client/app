import { useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'

export default function AuthCallback() {
  const router = useRouter()

  useEffect(() => {
    const run = async () => {
      const { data } = await supabase.auth.getSession()
      const session = data.session

      if (session?.user) {
        // recovery flow → force password update
        const isRecovery = session.user?.recovery || true

        if (isRecovery) {
          router.replace('/update-password')
          return
        }
      }

      router.replace('/')
    }

    run()
  }, [])

  return <p>Loading...</p>
}