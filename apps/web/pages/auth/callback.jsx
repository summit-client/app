import { useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'
import { ROLE_REDIRECTS } from '../../lib/role-redirects'

// How long to wait for the hash-based flow's onAuthStateChange to fire
// before giving up. Without this, an expired/invalid/already-used invite or
// recovery link (the tokens are present in the hash, so the earlier
// branches below are taken, but Supabase never resolves them to a session)
// left this page showing a bare "Loading..." forever - no error, no way
// out, nothing to screenshot or report but a permanently spinning tab.
const CALLBACK_TIMEOUT_MS = 10000

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
    const accessToken = hashParams.get('access_token')
    const refreshToken = hashParams.get('refresh_token')

    // Supabase redirects a failed hash-based flow (expired/used link) with
    // `#error=...&error_description=...` instead of access/refresh tokens -
    // surface that instead of silently dropping to a blank login page.
    const hashError = hashParams.get('error_description') || hashParams.get('error')
    if (hashError) {
      router.replace('/login?error=' + encodeURIComponent(hashError))
      return
    }

    if (accessToken && refreshToken) {
      let settled = false
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if (session) {
          settled = true
          subscription.unsubscribe()
          if (hashType === 'invite' || hashType === 'recovery') {
            window.location.href = '/update-password'
          } else {
            handleRoleRedirect(session)
          }
        }
      })
      const timeout = setTimeout(() => {
        if (settled) return
        subscription.unsubscribe()
        router.replace('/login?error=' + encodeURIComponent('That link is no longer valid. Please request a new one.'))
      }, CALLBACK_TIMEOUT_MS)
      return () => { clearTimeout(timeout); subscription.unsubscribe() }
    }

    router.replace('/login')
  }, [])

  async function handleRoleRedirect(session) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single()

    const role = profile?.role

    const destination = ROLE_REDIRECTS[role]
    if (destination) {
      window.location.href = destination
    } else {
      router.replace('/login')
    }
  }

  return <p>Loading...</p>
}