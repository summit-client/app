import { useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'

export default function AuthCallback() {
  const router = useRouter()

  useEffect(() => {
    const run = async () => {
      const hash = window.location.hash
      const query = new URLSearchParams(window.location.search)
      const code = query.get('code')

      if (code) {
        // PKCE flow
        const { error } = await supabase.auth.exchangeCodeForSession(window.location.href)
        if (error) {
          router.replace('/login')
          return
        }
      } else if (hash.includes('access_token')) {
        // Implicit flow
        const params = new URLSearchParams(hash.substring(1))
        const access_token = params.get('access_token')
        const refresh_token = params.get('refresh_token')
        if (access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({ access_token, refresh_token })
          if (error) {
            router.replace('/login')
            return
          }
        }
      } else {
        router.replace('/login')
        return
      }

      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        router.replace('/login')
        return
      }

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
        window.location.href = 'https://client.summitclink.io'
      } else {
        router.replace('/login')
      }
    }

    run()
  }, [])

  return <p>Loading...</p>
}