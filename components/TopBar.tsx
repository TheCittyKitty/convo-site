'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export function TopBar() {
  const router = useRouter()

  async function logOut() {
    await supabase.auth.signOut()
    router.replace('/')
  }

  return (
    <div className="topbar">
      <div style={{ fontWeight: 700 }}>Convo Rooms</div>
      <div className="row">
        <Link href="/lobby">Lobby</Link>
        <Link href="/settings">Settings & Profile</Link>
        <button className="button secondary" style={{ width: 'auto' }} onClick={logOut}>
          Log out
        </button>
      </div>
    </div>
  )
}
