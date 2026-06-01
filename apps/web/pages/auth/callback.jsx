import { useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'

export default function AuthCallback() {
  const router = useRouter()

  useEffect(() => {
    const handle = async () => {
      const { error } = await supabase.auth.getSession()

      // important: let supabase parse the URL hash
      const { data } = await supabase.auth.getUser()

      if (error) {
        console.error(error)
        router.replace('/login')
        return
      }

      router.replace('/update-password')
    }

    handle()
  }, [])

  return <p>Loading...</p>
}