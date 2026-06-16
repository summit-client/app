import { useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'

export default function AuthCallback() {
  const router = useRouter()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const tokenHash = params.get('token_hash')
    const type = params.get('type')

    if (tokenHash && type) {
      supabase.auth.verifyOtp({ token_hash: tokenHash, type })
        .then(async ({ data, error }) => {
          if (error) {
            router.replace('/login?error=' + encodeURIComponent(error.message))
            return
          }
          if (type === 'recovery') {
            router.replace('/update-password')
          } else {
            await handleRoleRedirect(data.session)
          }
        })
      return
    }

    // hash-based flows (invite, recovery, implicit login)
    const hashParams = new URLSearchParams(window.location.hash.replace('#', ''))
    const hashType = hashParams.get('type')

    async function routeFromSession(session) {
      if (!session) return
      if (hashType === 'invite' || hashType === 'recovery') {
        router.replace('/update-password')
      } else {
        await handleRoleRedirect(session)
      }
    }

    // catch the session if it was already set before this listener attached
    supabase.auth.getSession().then(({ data: { session } }) => routeFromSession(session))

    // and listen in case it resolves just after mount
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      routeFromSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function handleRoleRedirect(session) {
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

  return <p>Loading...</p>
}