import { useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'

export default function AuthCallback() {
  const router = useRouter()

  useEffect(() => {
    const run = async () => {
      const { error } = await supabase.auth.exchangeCodeForSession(window.location.href)

      if (error) {
        router.replace('/login')
        return
      }

      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        router.replace('/login')
        return
      }

      const hash = window.location.hash
      if (hash.includes('type=recovery') || hash.includes('type=invite')) {
        router.replace('/update-password')
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single()

      const role = profile?.role

      if (role === 'admin' || role === 'scheduler') {
        window.location.href = 'https://scheduler.summitclient.io'
      } else if (role === 'clinician') {
        window.location.href = 'https://data.summitclient.io'
      } else if (role === 'staff') {
        window.location.href = 'https://employee.summitclient.io'
      } else if (role === 'client') {
        window.location.href = 'https://client.summitclient.io'
      } else {
        router.replace('/login')
      }
    }

    run()
  }, [])

  return <p>Loading...</p>
}