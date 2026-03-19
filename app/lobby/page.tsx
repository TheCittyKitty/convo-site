'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { TopBar } from '@/components/TopBar'
import { getTopicForNow } from '@/lib/topics'

type Room = {
  id: string
  name: string
  capacity: number
}

export default function LobbyPage() {
  const router = useRouter()
  const [room, setRoom] = useState<Room | null>(null)

  useEffect(() => {
    let mounted = true

    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        router.replace('/')
        return
      }

      const { data: rooms } = await supabase.from('rooms').select('*').limit(1).single()
      if (mounted) setRoom(rooms)
    })

    return () => {
      mounted = false
    }
  }, [router])

  return (
    <div className="layout">
      <TopBar />
      <main className="container">
        <div style={{ paddingTop: 22 }}>
          <h1 style={{ marginBottom: 8 }}>Active chats</h1>
          <div className="small">Webfishing-style room list. Only one room is needed right now.</div>
        </div>

        <div className="lobby-list">
          {room ? (
            <div className="room-row">
              <div>
                <div style={{ fontWeight: 700 }}>{room.name}</div>
                <div className="small">Current topic: {getTopicForNow()}</div>
              </div>
              <div>
                <div className="small">People</div>
                <div>1 / {room.capacity}</div>
              </div>
              <div>
                <div className="small">Status</div>
                <div>Open</div>
              </div>
              <Link href={`/chat/${room.id}`} className="button" style={{ textAlign: 'center' }}>
                Join
              </Link>
            </div>
          ) : (
            <div className="small">No room found yet. Run the SQL seed so the starter room exists.</div>
          )}
        </div>
      </main>
    </div>
  )
}
