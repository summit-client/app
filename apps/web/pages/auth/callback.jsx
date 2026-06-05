import { useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'

export default function AuthCallback() {
  const router = useRouter()

  useEffect(() => {
    const run = async () => {
      console.log('callback started')
      const hash = window.location.hash
      const query = new URLSearchParams(window.location.search)
      const code = query.get('code')
      console.log('code:', code)
      console.log('hash:', hash.substring(0, 50))

      if (code) {
        console.log('pkce flow')
        const { error } = await supabase.auth.exchangeCodeForSession(window.location.href)
        console.log('exchange error:', error)
        if (error) { router.replace('/login'); return }
      } else if (hash.includes('access_token')) {
        console.log('implicit flow')
        const params = new URLSearchParams(hash.substring(1))
        const access_token = params.get('access_token')
        const refresh_token = params.get('refresh_token')
        console.log('tokens present:', !!access_token, !!refresh_token)
        console.log('supabase client type:', typeof supabase.auth.setSession)
        const { error } = await supabase.auth.setSession({ access_token, refresh_token })
        console.log('setSession error:', error)
        if (error) { router.replace('/login'); return }
      } else {
        console.log('no auth params found')
        router.replace('/login')
        return
      }

      console.log('getting session')
      const { data: { session } } = await supabase.auth.getSession()
      console.log('session:', session?.user?.email)

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
      console.log('role:', role)

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